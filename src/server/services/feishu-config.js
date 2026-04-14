const fs = require('fs');
const path = require('path');
const { getAppDir } = require('../../utils/app-path-manager');

function getUiConfigPath() {
  return path.join(getAppDir(), 'ui-config.json');
}

function readUIConfig() {
  try {
    const configPath = getUiConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
    return {};
  } catch (error) {
    return {};
  }
}

function writeUIConfig(config) {
  try {
    const configPath = getUiConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write UI config:', error);
    return false;
  }
}

function getFeishuConfig() {
  const uiConfig = readUIConfig();
  return {
    enabled: uiConfig.feishuNotification?.enabled || false,
    webhookUrl: uiConfig.feishuNotification?.webhookUrl || ''
  };
}

function saveFeishuConfig(feishu) {
  const uiConfig = readUIConfig();
  uiConfig.feishuNotification = {
    enabled: feishu?.enabled || false,
    webhookUrl: feishu?.webhookUrl || ''
  };
  return writeUIConfig(uiConfig);
}

module.exports = {
  getFeishuConfig,
  saveFeishuConfig,
  readUIConfig,
  writeUIConfig
};
