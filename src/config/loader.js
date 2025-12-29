// 配置加载和保存
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getAppDir, getLegacyAppDir } = require('../utils/app-path-manager');
const DEFAULT_CONFIG = require('./default');

const PROJECT_CONFIG_FILE = path.join(__dirname, '../../config.json');
const APP_CONFIG_FILE = path.join(getAppDir(), 'config.json');
const LEGACY_APP_CONFIG_FILE = path.join(getLegacyAppDir(), 'config.json');

function resolveConfigFile() {
  if (fs.existsSync(APP_CONFIG_FILE)) {
    return APP_CONFIG_FILE;
  }
  if (fs.existsSync(LEGACY_APP_CONFIG_FILE)) {
    return LEGACY_APP_CONFIG_FILE;
  }
  if (fs.existsSync(PROJECT_CONFIG_FILE)) {
    return PROJECT_CONFIG_FILE;
  }
  return APP_CONFIG_FILE;
}

/**
 * 展开 ~ 为用户主目录
 */
function expandHome(filepath) {
  if (filepath.startsWith('~')) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

function mergePricing(defaultPricing, overrides = {}) {
  const merged = {};
  Object.keys(defaultPricing).forEach((key) => {
    merged[key] = {
      ...defaultPricing[key],
      ...(overrides && overrides[key] ? overrides[key] : {})
    };
    if (!merged[key].mode) {
      merged[key].mode = 'auto';
    }
  });
  return merged;
}

/**
 * 加载配置
 */
function loadConfig() {
  try {
    const configFile = resolveConfigFile();
    if (fs.existsSync(configFile)) {
      const userConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      const config = { ...DEFAULT_CONFIG, ...userConfig };
      config.projectsDir = expandHome(config.projectsDir);

      // 合并 ports 配置
      config.ports = { ...DEFAULT_CONFIG.ports, ...userConfig.ports };
      config.pricing = mergePricing(DEFAULT_CONFIG.pricing, userConfig.pricing);

      // 确保有 currentProject，使用 defaultProject 作为 currentProject
      if (!config.currentProject && config.defaultProject) {
        config.currentProject = config.defaultProject;
      }

      return config;
    }
  } catch (error) {
    console.error('加载配置文件失败，使用默认配置');
  }
  return { ...DEFAULT_CONFIG, currentProject: DEFAULT_CONFIG.defaultProject };
}

/**
 * 保存配置
 */
function saveConfig(config) {
  try {
    const configFile = resolveConfigFile();
    const configDir = path.dirname(configFile);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('保存配置失败:', error.message);
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  expandHome,
};
