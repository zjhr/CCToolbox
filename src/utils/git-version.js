const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { compareVersions } = require('./version-check');

const FETCH_TIMEOUT_MS = 2000;

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

  const remoteUrl = await getRemoteUrl(rootDir);
  const httpsUrl = toHttpsUrl(remoteUrl);
  let fetchWarning = null;
  let fetchRef = 'origin/main';

  if (httpsUrl) {
    const fetchResult = await runGitCommand(
      ['fetch', httpsUrl, 'main', '--quiet', '--depth=1'],
      {
        cwd: rootDir,
        timeout: FETCH_TIMEOUT_MS
      }
    );
    const fetchError = fetchResult.error && !fetchResult.timedOut;
    fetchWarning = fetchError ? (fetchResult.stderr || fetchResult.error.message) : null;
    if (!fetchError) {
      fetchRef = 'FETCH_HEAD';
    }
  } else {
    const fetchResult = await runGitCommand(['fetch', 'origin', 'main', '--quiet'], {
      cwd: rootDir,
      timeout: FETCH_TIMEOUT_MS
    });
    const fetchError = fetchResult.error && !fetchResult.timedOut;
    fetchWarning = fetchError ? (fetchResult.stderr || fetchResult.error.message) : null;
  }

  let remoteVersion = await getRemoteVersion(rootDir, fetchRef);
  if (!remoteVersion && fetchRef !== 'origin/main') {
    remoteVersion = await getRemoteVersion(rootDir, 'origin/main');
  }
  if (!remoteVersion) {
    return {
      type: 'git',
      hasUpdate: false,
      current: currentVersion,
      latest: null,
      error: true,
      reason: fetchWarning || 'remote version unavailable'
    };
  }

  const hasUpdate = compareVersions(remoteVersion, currentVersion) > 0;
  return {
    type: 'git',
    hasUpdate,
    current: currentVersion,
    latest: remoteVersion,
    warning: fetchWarning
  };
}

module.exports = {
  isGitRepository,
  getPackageVersion,
  getRemoteVersion,
  checkGitUpdate
};
