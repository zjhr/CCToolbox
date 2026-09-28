const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { compareVersions } = require('./version-check');

const FETCH_TIMEOUT_MS = 15000;

function runGitCommand(args, options = {}) {
  const { cwd, timeout = FETCH_TIMEOUT_MS } = options;

  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout }, (error, stdout = '', stderr = '') => {
      if (error) {
        const timedOut = error.killed || error.signal === 'SIGTERM' || error.signal === 'SIGKILL';
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          error,
          timedOut
        });
        return;
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString(), error: null, timedOut: false });
    });
  });
}

function getPackageVersion(rootDir) {
  const packagePath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version || null;
}

async function isGitRepository(rootDir) {
  const result = await runGitCommand(['rev-parse', '--is-inside-work-tree'], {
    cwd: rootDir,
    timeout: FETCH_TIMEOUT_MS
  });
  if (result.error) {
    return false;
  }
  return result.stdout.trim() === 'true';
}

async function getRemoteUrl(rootDir) {
  const result = await runGitCommand(['remote', 'get-url', 'origin'], {
    cwd: rootDir,
    timeout: FETCH_TIMEOUT_MS
  });
  if (result.error) {
    return null;
  }
  return result.stdout.trim();
}

function toHttpsUrl(remoteUrl) {
  if (!remoteUrl || typeof remoteUrl !== 'string') {
    return null;
  }
  if (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://')) {
    return remoteUrl;
  }

  const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/, '')}.git`;
  }

  const sshUrlMatch = remoteUrl.match(/^ssh:\/\/(?:git@)?([^/]+)\/(.+?)(\.git)?$/);
  if (sshUrlMatch) {
    return `https://${sshUrlMatch[1]}/${sshUrlMatch[2].replace(/\.git$/, '')}.git`;
  }

  return remoteUrl;
}

async function getRemoteVersion(rootDir, ref = 'origin/main') {
  const showResult = await runGitCommand(['show', `${ref}:package.json`], {
    cwd: rootDir,
    timeout: FETCH_TIMEOUT_MS
  });

  if (showResult.error) {
    return null;
  }

  try {
    const pkg = JSON.parse(showResult.stdout);
    return pkg.version || null;
  } catch (err) {
    return null;
  }
}

// 获取本地或远端引用的提交号，补足仅比较 package.json 版本的盲区。
async function getCommitHash(rootDir, ref) {
  const result = await runGitCommand(['rev-parse', ref], {
    cwd: rootDir,
    timeout: FETCH_TIMEOUT_MS
  });

  if (result.error) {
    return null;
  }

  return result.stdout.trim() || null;
}

async function checkGitUpdate(rootDir) {
  const isRepo = await isGitRepository(rootDir);
  if (!isRepo) {
    return {
      type: 'npm',
      hasUpdate: false
    };
  }

  const currentVersion = getPackageVersion(rootDir);
  if (!currentVersion) {
    return {
      type: 'git',
      hasUpdate: false,
      current: null,
      latest: null,
      error: true,
      reason: 'missing package.json'
    };
  }

  const currentCommit = await getCommitHash(rootDir, 'HEAD');
  if (!currentCommit) {
    return {
      type: 'git',
      hasUpdate: false,
      current: currentVersion,
      latest: null,
      error: true,
      reason: 'local commit unavailable'
    };
  }

  const remoteUrl = await getRemoteUrl(rootDir);
  const httpsUrl = toHttpsUrl(remoteUrl);
  let fetchRef = 'origin/main';
  let fetchResult;

  if (httpsUrl) {
    fetchResult = await runGitCommand(
      ['fetch', httpsUrl, 'main', '--quiet', '--depth=1'],
      {
        cwd: rootDir,
        timeout: FETCH_TIMEOUT_MS
      }
    );
    if (!fetchResult.error) {
      fetchRef = 'FETCH_HEAD';
    } else if (!fetchResult.timedOut) {
      fetchResult = await runGitCommand(['fetch', 'origin', 'main', '--quiet'], {
        cwd: rootDir,
        timeout: FETCH_TIMEOUT_MS
      });
      if (!fetchResult.error) {
        fetchRef = 'origin/main';
      }
    }
  } else {
    fetchResult = await runGitCommand(['fetch', 'origin', 'main', '--quiet'], {
      cwd: rootDir,
      timeout: FETCH_TIMEOUT_MS
    });
  }

  if (fetchResult.error) {
    return {
      type: 'git',
      hasUpdate: false,
      current: currentVersion,
      latest: null,
      currentCommit,
      latestCommit: null,
      error: true,
      reason: fetchResult.stderr || fetchResult.error.message
    };
  }

  const remoteVersion = await getRemoteVersion(rootDir, fetchRef);
  if (!remoteVersion) {
    return {
      type: 'git',
      hasUpdate: false,
      current: currentVersion,
      latest: null,
      currentCommit,
      latestCommit: null,
      error: true,
      reason: 'remote version unavailable'
    };
  }

  const latestCommit = await getCommitHash(rootDir, fetchRef);
  if (!latestCommit) {
    return {
      type: 'git',
      hasUpdate: false,
      current: currentVersion,
      latest: remoteVersion,
      currentCommit,
      latestCommit: null,
      error: true,
      reason: 'remote commit unavailable'
    };
  }

  const hasUpdate =
    latestCommit !== currentCommit ||
    compareVersions(remoteVersion, currentVersion) > 0;
  return {
    type: 'git',
    hasUpdate,
    current: currentVersion,
    latest: remoteVersion,
    currentCommit,
    latestCommit
  };
}

module.exports = {
  isGitRepository,
  getPackageVersion,
  getRemoteVersion,
  checkGitUpdate
};
