const fs = require('fs');
const path = require('path');
const os = require('os');
const { getBackupPath: getAppBackupPath } = require('../../utils/app-path-manager');

// Claude Code 配置文件路径
function getSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

// 备份文件路径
function getBackupPath() {
  return getAppBackupPath('claude-settings');
}

// 检查配置文件是否存在
function settingsExists() {
  return fs.existsSync(getSettingsPath());
}

// 检查是否已经有备份
function hasBackup() {
  return fs.existsSync(getBackupPath());
}

// 读取配置文件
function readSettings() {
  try {
    const content = fs.readFileSync(getSettingsPath(), 'utf8');
    return JSON.parse(content);
  } catch (err) {
    throw new Error('Failed to read settings.json: ' + err.message);
  }
}

// 写入配置文件（原子写入）
function writeSettings(settings) {
  const settingsPath = getSettingsPath();
  const content = JSON.stringify(settings, null, 2);

  // Validate JSON roundtrip integrity
  try {
    JSON.parse(content);
  } catch (err) {
    throw new Error('Settings data failed JSON roundtrip validation: ' + err.message);
  }

  // Ensure directory exists
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  // Atomic write: temp file + rename
  const tmpPath = settingsPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');

    // Read back and verify written content
    const written = fs.readFileSync(tmpPath, 'utf8');
    JSON.parse(written);

    // Atomic rename (original file preserved until rename succeeds)
    fs.renameSync(tmpPath, settingsPath);
  } catch (err) {
    // Clean up temp file on failure
    try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore cleanup error */ }
    throw new Error('Failed to write settings.json atomically: ' + err.message);
  }
}

// 备份当前配置
function backupSettings(options = {}) {
  try {
    if (!settingsExists()) {
      throw new Error('settings.json not found');
    }

    const force = options.force === true;
    // 如果已经有备份，不覆盖（除非 force）
    if (hasBackup() && !force) {
      console.log('Backup already exists, skipping backup');
      return { success: true, alreadyExists: true };
    }

    const content = fs.readFileSync(getSettingsPath(), 'utf8');
    fs.writeFileSync(getBackupPath(), content, 'utf8');

    console.log('✅ Settings backed up to:', getBackupPath());
    return { success: true, alreadyExists: false };
  } catch (err) {
    throw new Error('Failed to backup settings: ' + err.message);
  }
}

// 丢弃备份（不恢复）——写入渠道后 settings 已正确时使用
function clearBackup() {
  try {
    const backupPath = getBackupPath();
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      return { success: true, removed: true };
    }
    return { success: true, removed: false };
  } catch (err) {
    throw new Error('Failed to clear backup: ' + err.message);
  }
}

// 恢复配置
function restoreSettings() {
  try {
    if (!hasBackup()) {
      throw new Error('No backup found');
    }

    const content = fs.readFileSync(getBackupPath(), 'utf8');
    fs.writeFileSync(getSettingsPath(), content, 'utf8');

    // 删除备份文件
    fs.unlinkSync(getBackupPath());

    console.log('✅ Settings restored from backup');
    return { success: true };
  } catch (err) {
    throw new Error('Failed to restore settings: ' + err.message);
  }
}

// 设置代理配置
function setProxyConfig(proxyPort) {
  try {
    // 进入代理模式前：强制刷新备份为「当前真实配置」
    // 避免渠道写入留下的陈旧 backup 导致关闭代理时 env 被错误还原
    if (!isProxyConfig()) {
      backupSettings({ force: true });
    } else if (!hasBackup()) {
      console.warn('Proxy config active without backup; continue without snapshot');
    }

    // 读取当前配置
    const settings = readSettings();

    // 确保 env 对象存在
    if (!settings.env) {
      settings.env = {};
    }

    // 仅改写代理所需字段，保留其余 env
    settings.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${proxyPort}`;
    settings.env.ANTHROPIC_API_KEY = 'PROXY_KEY';
    // 避免 AUTH_TOKEN 与 PROXY_KEY 并存导致语义混乱
    delete settings.env.ANTHROPIC_AUTH_TOKEN;
    settings.apiKeyHelper = `echo 'PROXY_KEY'`;

    // 写入
    writeSettings(settings);

    console.log(`✅ Settings updated to use proxy on port ${proxyPort}`);
    return { success: true, port: proxyPort };
  } catch (err) {
    throw new Error('Failed to set proxy config: ' + err.message);
  }
}

// 检查当前是否是代理配置
function isProxyConfig() {
  try {
    if (!settingsExists()) {
      return false;
    }

    const settings = readSettings();
    const baseUrl = settings?.env?.ANTHROPIC_BASE_URL || '';
    const apiKey = settings?.env?.ANTHROPIC_API_KEY || '';

    return baseUrl.includes('127.0.0.1') || apiKey === 'PROXY_KEY';
  } catch (err) {
    return false;
  }
}

// 获取当前代理端口（如果是代理配置）
function getCurrentProxyPort() {
  try {
    if (!isProxyConfig()) {
      return null;
    }

    const settings = readSettings();
    const baseUrl = settings?.env?.ANTHROPIC_BASE_URL || '';
    const match = baseUrl.match(/:(\d+)/);

    return match ? parseInt(match[1]) : null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  getSettingsPath,
  getBackupPath,
  settingsExists,
  hasBackup,
  readSettings,
  writeSettings,
  backupSettings,
  clearBackup,
  restoreSettings,
  setProxyConfig,
  isProxyConfig,
  getCurrentProxyPort
};
