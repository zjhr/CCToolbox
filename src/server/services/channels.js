const fs = require('fs');
const path = require('path');
const os = require('os');
const { isProxyConfig, writeSettings: atomicWriteSettings, backupSettings, settingsExists: claudeSettingsExists } = require('./settings-manager');
const { getAppDir, getChannelsPath } = require('../../utils/app-path-manager');

function ensureAppDir() {
  const dir = getAppDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getChannelsFilePath() {
  const filePath = getChannelsPath();
  ensureAppDir();
  return filePath;
}

function getActiveChannelIdPath() {
  const dir = ensureAppDir();
  return path.join(dir, 'active-channel.json');
}

function getClaudeSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function saveActiveChannelId(channelId) {
  const filePath = getActiveChannelIdPath();
  fs.writeFileSync(filePath, JSON.stringify({ activeChannelId: channelId }, null, 2), 'utf8');
}

function loadActiveChannelId() {
  const filePath = getActiveChannelIdPath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      return data.activeChannelId || null;
    }
  } catch (error) {
    console.error('Error loading active channel ID:', error);
  }
  return null;
}

let channelsCache = null;
let channelsCacheInitialized = false;
const DEFAULT_CHANNELS = { channels: [] };

function normalizeNumber(value, defaultValue, max = null) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return defaultValue;
  }
  if (max !== null && num > max) {
    return max;
  }
  return num;
}

function applyChannelDefaults(channel) {
  const normalized = normalizeLegacyChannel(channel);
  if (normalized.enabled === undefined) {
    normalized.enabled = true;
  } else {
    normalized.enabled = !!normalized.enabled;
  }

  normalized.weight = normalizeNumber(normalized.weight, 1, 100);

  if (normalized.maxConcurrency === undefined ||
      normalized.maxConcurrency === null ||
      normalized.maxConcurrency === 0) {
    normalized.maxConcurrency = null;
  } else {
    normalized.maxConcurrency = normalizeNumber(normalized.maxConcurrency, 1, 100);
  }

  return normalized;
}

function normalizeLegacyChannel(channel) {
  const normalized = { ...channel };

  if (!normalized.baseUrl && normalized.baseURL) {
    normalized.baseUrl = normalized.baseURL;
  }

  if (!normalized.apiKey && normalized.api_key) {
    normalized.apiKey = normalized.api_key;
  }

  const legacyModel = normalized.model || normalized.modelName || '';
  if (normalized.modelConfig && typeof normalized.modelConfig === 'object') {
    normalized.modelConfig = { ...normalized.modelConfig };
    if (!normalized.modelConfig.model && legacyModel) {
      normalized.modelConfig.model = legacyModel;
    }
  } else if (legacyModel) {
    normalized.modelConfig = {
      model: legacyModel
    };
  }

  return normalized;
}

function readChannelsFromFile() {
  const filePath = getChannelsFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      data.channels = (data.channels || []).map(applyChannelDefaults);
      return data;
    }
  } catch (error) {
    console.error('Error loading channels:', error);
  }
  return { ...DEFAULT_CHANNELS };
}

function initializeChannelsCache() {
  if (channelsCacheInitialized) return;
  channelsCache = readChannelsFromFile();
  channelsCacheInitialized = true;

  try {
    const filePath = getChannelsFilePath();
    fs.watchFile(filePath, { persistent: false }, () => {
      channelsCache = readChannelsFromFile();
    });
  } catch (err) {
    console.error('Failed to watch channels file:', err);
  }
}

function loadChannels() {
  if (!channelsCacheInitialized) {
    initializeChannelsCache();
  }
  return JSON.parse(JSON.stringify(channelsCache));
}

function saveChannels(data) {
  const filePath = getChannelsFilePath();
  const payload = {
    ...data,
    channels: (data.channels || []).map(applyChannelDefaults)
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  channelsCache = JSON.parse(JSON.stringify(payload));
}

function getCurrentSettings() {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    let baseUrl = settings.env?.ANTHROPIC_BASE_URL || '';
    let apiKey = settings.env?.ANTHROPIC_API_KEY ||
                 settings.env?.ANTHROPIC_AUTH_TOKEN ||
                 '';

    if (!apiKey && settings.apiKeyHelper) {
      const match = settings.apiKeyHelper.match(/['"]([^'"]+)['"]/);
      if (match && match[1]) {
        apiKey = match[1];
      }
    }

    if (!baseUrl && !apiKey) {
      return null;
    }

    return { baseUrl, apiKey };
  } catch (error) {
    console.error('Error reading current settings:', error);
    return null;
  }
}

function getBestChannelForRestore() {
  const data = loadChannels();
  const enabledChannels = data.channels.filter(ch => ch.enabled !== false);

  if (enabledChannels.length === 0) {
    return data.channels[0];
  }

  enabledChannels.sort((a, b) => (b.weight || 1) - (a.weight || 1));
  return enabledChannels[0];
}

function getAllChannels() {
  const data = loadChannels();
  return data.channels;
}

function createChannel(name, baseUrl, apiKey, websiteUrl, extraConfig = {}) {
  const data = loadChannels();
  const newChannel = applyChannelDefaults({
    id: `channel-${Date.now()}`,
    name,
    baseUrl,
    apiKey,
    createdAt: Date.now(),
    websiteUrl: websiteUrl || undefined,
    enabled: extraConfig.enabled !== undefined ? !!extraConfig.enabled : true,
    weight: extraConfig.weight,
    maxConcurrency: extraConfig.maxConcurrency,
    presetId: extraConfig.presetId || 'official',
    modelConfig: extraConfig.modelConfig || null,
    proxyUrl: extraConfig.proxyUrl || ''
  });

  data.channels.push(newChannel);
  saveChannels(data);
  return newChannel;
}

function updateChannel(id, updates) {
  const data = loadChannels();
  const index = data.channels.findIndex(ch => ch.id === id);

  if (index === -1) {
    throw new Error('Channel not found');
  }

  const merged = { ...data.channels[index], ...updates };
  data.channels[index] = applyChannelDefaults({
    ...merged,
    weight: merged.weight,
    maxConcurrency: merged.maxConcurrency,
    enabled: merged.enabled,
    presetId: merged.presetId,
    modelConfig: merged.modelConfig,
    proxyUrl: merged.proxyUrl
  });

  saveChannels(data);
  return data.channels[index];
}

function deleteChannel(id) {
  const data = loadChannels();
  const index = data.channels.findIndex(ch => ch.id === id);

  if (index === -1) {
    throw new Error('Channel not found');
  }

  data.channels.splice(index, 1);
  saveChannels(data);
  return { success: true };
}

// Shell 转义单引号（防止命令注入）
function escapeSingleQuote(str) {
  return str.replace(/'/g, "'\\''");
}

// 校验渠道数据格式
function validateChannelData(channel) {
  if (!channel.name || typeof channel.name !== 'string' || channel.name.trim() === '') {
    throw new Error('Channel name is required and must not be empty');
  }
  if (!channel.baseUrl || typeof channel.baseUrl !== 'string') {
    throw new Error('Channel baseUrl is required');
  }
  if (!/^https?:\/\/[^\s]+$/.test(channel.baseUrl)) {
    throw new Error('Channel baseUrl must be a valid http/https URL');
  }
  if (channel.baseUrl.includes('\0')) {
    throw new Error('Channel baseUrl contains invalid characters');
  }
  if (!channel.apiKey || typeof channel.apiKey !== 'string') {
    throw new Error('Channel apiKey is required');
  }
  if (channel.apiKey.includes('\n') || channel.apiKey.includes('\r')) {
    throw new Error('Channel apiKey must not contain newline characters');
  }
  if (channel.apiKey.includes('\0')) {
    throw new Error('Channel apiKey contains invalid characters');
  }
}

function applyChannelToSettings(id) {
  const data = loadChannels();
  const channel = data.channels.find(ch => ch.id === id);

  if (!channel) {
    throw new Error('Channel not found');
  }

  // Validate channel data before writing
  validateChannelData(channel);

  // Backup current settings before writing
  if (claudeSettingsExists()) {
    try {
      backupSettings();
    } catch (err) {
      throw new Error('Failed to backup settings before applying: ' + err.message);
    }
  }

  // Write settings FIRST, then update business state (avoid state drift on failure)
  updateClaudeSettingsWithModelConfig(channel);

  channel.enabled = true;
  saveChannels(data);
  saveActiveChannelId(channel.id);

  return channel;
}

function getCurrentChannel() {
  const channels = getAllChannels();
  if (channels.length === 0) {
    return { channel: null, warning: null };
  }

  const activeChannelId = loadActiveChannelId();
  if (activeChannelId) {
    const activeChannel = channels.find(ch => ch.id === activeChannelId);
    if (activeChannel) {
      return { channel: activeChannel, warning: null };
    }
  }

  const settings = getCurrentSettings();
  if (!settings) {
    // Check for config file anomalies
    const settingsPath = getClaudeSettingsPath();
    if (fs.existsSync(settingsPath)) {
      try {
        JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return {
          channel: null,
          warning: {
            reason: '当前配置中没有匹配的渠道信息',
            suggestion: '请手动选择一个渠道并写入配置'
          }
        };
      } catch (err) {
        return {
          channel: null,
          warning: {
            reason: 'settings.json 配置文件格式异常，无法解析',
            suggestion: '请检查配置文件格式或使用备份恢复'
          }
        };
      }
    }
    return { channel: null, warning: null };
  }

  const matched = channels.find(ch =>
    ch.baseUrl === settings.baseUrl && ch.apiKey === settings.apiKey
  );

  if (matched) {
    return { channel: matched, warning: null };
  }

  return {
    channel: null,
    warning: {
      reason: '当前配置的渠道不在列表中，可能是外部修改了配置',
      suggestion: '请手动选择一个渠道并写入配置'
    }
  };
}

function updateClaudeSettingsWithModelConfig(channel) {
  const settingsPath = getClaudeSettingsPath();

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }

  if (!settings.env) {
    settings.env = {};
  }

  const { baseUrl, apiKey, modelConfig, presetId, proxyUrl } = channel;

  const useAuthToken = settings.env.ANTHROPIC_AUTH_TOKEN !== undefined;
  const useApiKey = settings.env.ANTHROPIC_API_KEY !== undefined;

  settings.env.ANTHROPIC_BASE_URL = baseUrl;

  if (useAuthToken || (!useAuthToken && !useApiKey)) {
    settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    delete settings.env.ANTHROPIC_API_KEY;
  } else {
    settings.env.ANTHROPIC_API_KEY = apiKey;
  }

  if (presetId && presetId !== 'official' && modelConfig) {
    if (modelConfig.model) {
      settings.env.ANTHROPIC_MODEL = modelConfig.model;
    } else {
      delete settings.env.ANTHROPIC_MODEL;
    }
    if (modelConfig.haikuModel) {
      settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelConfig.haikuModel;
    } else {
      delete settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    }
    if (modelConfig.sonnetModel) {
      settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = modelConfig.sonnetModel;
    } else {
      delete settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    }
    if (modelConfig.opusModel) {
      settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = modelConfig.opusModel;
    } else {
      delete settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    }
  } else {
    delete settings.env.ANTHROPIC_MODEL;
    delete settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    delete settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    delete settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  }

  if (proxyUrl) {
    settings.env.HTTPS_PROXY = proxyUrl;
    settings.env.HTTP_PROXY = proxyUrl;
  } else {
    delete settings.env.HTTPS_PROXY;
    delete settings.env.HTTP_PROXY;
    delete settings.env.NO_PROXY;
  }

  settings.apiKeyHelper = `echo '${escapeSingleQuote(apiKey)}'`;

  atomicWriteSettings(settings);
}

function updateClaudeSettings(baseUrl, apiKey) {
  const settingsPath = getClaudeSettingsPath();

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }

  if (!settings.env) {
    settings.env = {};
  }

  const useAuthToken = settings.env.ANTHROPIC_AUTH_TOKEN !== undefined;
  const useApiKey = settings.env.ANTHROPIC_API_KEY !== undefined;

  settings.env.ANTHROPIC_BASE_URL = baseUrl;

  if (useAuthToken || (!useAuthToken && !useApiKey)) {
    settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    delete settings.env.ANTHROPIC_API_KEY;
  } else {
    settings.env.ANTHROPIC_API_KEY = apiKey;
  }

  settings.apiKeyHelper = `echo '${escapeSingleQuote(apiKey)}'`;

  atomicWriteSettings(settings);
}

module.exports = {
  getAllChannels,
  getCurrentSettings,
  createChannel,
  updateChannel,
  deleteChannel,
  applyChannelToSettings,
  getBestChannelForRestore,
  getCurrentChannel,
  updateClaudeSettings,
  validateChannelData
};
