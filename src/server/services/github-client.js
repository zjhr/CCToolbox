/**
 * GitHub API 客户端（用于版本更新检测）
 */

const https = require('https');
const http = require('http');
const { Octokit } = require('@octokit/rest');
const semver = require('semver');

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000];

class GitHubClient {
  constructor(options = {}) {
    const token = options.token || null;
    this.octokit = options.octokit || new Octokit({
      auth: token || undefined,
      userAgent: 'cctoolbox-skill-update'
    });
    this.retryDelays = Array.isArray(options.retryDelays) && options.retryDelays.length > 0
      ? options.retryDelays
      : DEFAULT_RETRY_DELAYS;
  }

  async fetchUpdates(owner, repo) {
    return this.withRetry(async () => {
      const response = await this.octokit.repos.listTags({
        owner,
        repo,
        per_page: 100
      });
      return response?.data || [];
    });
  }

  compareVersions(localVersion, remoteVersion) {
    const local = semver.valid(localVersion) || '0.0.0';
    const remote = semver.valid(remoteVersion) || '0.0.0';
    return semver.gt(remote, local);
  }

  async fetchRawFile(url) {
    return this.withRetry(() => this.requestRaw(url));
  }

  async withRetry(task) {
    let lastError = null;
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt += 1) {
      try {
        return await task();
      } catch (err) {
        lastError = err;
        if (attempt >= this.retryDelays.length) {
          break;
        }
        const isRateLimit = err.status === 403 || /403/.test(err.message || '');
        const delay = isRateLimit ? 2000 : this.retryDelays[attempt];
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  requestRaw(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, {
        headers: {
          'User-Agent': 'cctoolbox-skill-update'
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GitHub raw fetch error: ${res.statusCode}`));
        }
        res.setEncoding('utf-8');
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error('GitHub raw fetch timeout'));
      });
    });
  }
}

module.exports = {
  GitHubClient
};
