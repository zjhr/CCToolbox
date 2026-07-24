const fs = require('fs');
const path = require('path');
const os = require('os');
const { getAppDir } = require('../../utils/app-path-manager');

function getRuntimeFilePath(proxyType) {
  const appDir = getAppDir();
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return path.join(appDir, `${proxyType}-proxy-runtime.json`);
}

function getEnabledFlagPath(proxyType) {
  const appDir = getAppDir();
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return path.join(appDir, `${proxyType}-proxy-enabled`);
}

function getLegacyActiveFlagPath(proxyType) {
  return path.join(os.homedir(), '.claude', `.proxy-active-${proxyType}`);
}

/**
 * Explicit proxy on/off intent.
 * Must NOT be inferred from channel-write backups or active-channel.json.
 */
function setProxyEnabled(proxyType, enabled) {
  const flagPath = getEnabledFlagPath(proxyType);
  const legacyPath = getLegacyActiveFlagPath(proxyType);
  try {
    if (enabled) {
      fs.writeFileSync(
        flagPath,
        JSON.stringify({ enabled: true, at: Date.now() }),
        'utf8'
      );
      try {
        const dir = path.dirname(legacyPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(legacyPath, '1', 'utf8');
      } catch (e) {
        // legacy marker is best-effort (daemon status display)
      }
    } else {
      if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
      if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
    }
  } catch (err) {
    console.error(`Failed to set ${proxyType} proxy enabled flag:`, err);
  }
}

function isProxyEnabled(proxyType) {
  try {
    return fs.existsSync(getEnabledFlagPath(proxyType));
  } catch (err) {
    return false;
  }
}

function saveProxyStartTime(proxyType, preserveExisting = false) {
  try {
    const filePath = getRuntimeFilePath(proxyType);
    if (preserveExisting && fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    const data = { startTime: Date.now(), type: proxyType };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return data;
  } catch (err) {
    console.error(`Failed to save ${proxyType} proxy start time:`, err);
    return null;
  }
}

function getProxyStartTime(proxyType) {
  try {
    const filePath = getRuntimeFilePath(proxyType);
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data.startTime || null;
  } catch (err) {
    return null;
  }
}

function clearProxyStartTime(proxyType) {
  try {
    const filePath = getRuntimeFilePath(proxyType);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Failed to clear ${proxyType} proxy start time:`, err);
  }
}

function getProxyRuntime(proxyType) {
  const startTime = getProxyStartTime(proxyType);
  return startTime ? Date.now() - startTime : null;
}

function formatRuntime(ms) {
  if (!ms || ms < 0) {
    return { hours: 0, minutes: 0, seconds: 0, formatted: '0秒' };
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let formatted = '';
  if (hours > 0) formatted += `${hours}小时`;
  if (minutes > 0) formatted += `${minutes}分`;
  if (seconds > 0 || formatted === '') formatted += `${seconds}秒`;

  return { hours, minutes, seconds, formatted };
}

module.exports = {
  saveProxyStartTime,
  getProxyStartTime,
  clearProxyStartTime,
  getProxyRuntime,
  formatRuntime,
  setProxyEnabled,
  isProxyEnabled
};
