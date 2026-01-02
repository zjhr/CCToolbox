const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getAppDir } = require('../../utils/app-path-manager');

const CONFIG_FILE_NAME = 'ai-config.json';
const KEY_FILE_NAME = 'ai-config.key';
const API_KEY_MASK = '********';

const DEFAULT_AI_CONFIG = {
  version: 1,
  privacyAccepted: false,
  defaultProvider: 'ollama',
  providers: {
    ollama: {
      enabled: true,
      baseUrl: 'http://localhost:11434',
      modelName: 'qwen2.5:14b'
    },
    openai: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      modelName: 'gpt-4o-mini'
    },
    gemini: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com',
      modelName: 'gemini-1.5-flash'
    }
  },
  presetTags: ['bug', 'feature', 'refactor', 'docs', 'test', 'chore']
};

function ensureAppDir() {
  const appDir = getAppDir();
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return appDir;
}

function getConfigPath() {
  const appDir = ensureAppDir();
  return path.join(appDir, CONFIG_FILE_NAME);
}

function getKeyPath() {
  const appDir = ensureAppDir();
  return path.join(appDir, KEY_FILE_NAME);
}

function ensureFilePermissions(filePath) {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    // 权限设置失败不影响主流程
  }
}

function loadEncryptionKey() {
  const keyPath = getKeyPath();
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf8').trim();
    return Buffer.from(raw, 'base64');
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString('base64'), 'utf8');
  ensureFilePermissions(keyPath);
  return key;
}

function encryptValue(value) {
  if (!value) {
    return '';
  }
  const key = loadEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');
  return `enc:${iv.toString('base64')}:${tag}:${encrypted}`;
}

function decryptValue(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  if (!value.startsWith('enc:')) {
    return value;
  }
  const parts = value.split(':');
  if (parts.length !== 4) {
    return '';
  }
  const key = loadEncryptionKey();
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const encrypted = parts[3];
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return '';
  }
}

function isMaskedValue(value) {
  return typeof value === 'string' && value.length >= 4 && /^[*]+$/.test(value);
}

function mergeProviders(currentProviders = {}, nextProviders = {}) {
  const merged = {};
  for (const key of Object.keys(DEFAULT_AI_CONFIG.providers)) {
    const defaults = DEFAULT_AI_CONFIG.providers[key];
    const current = currentProviders[key] || {};
    const incoming = nextProviders[key] || {};
    merged[key] = {
      ...defaults,
      ...current,
      ...incoming
    };
  }
  return merged;
}

function normalizeConfig(rawConfig = {}) {
  const mergedProviders = mergeProviders(rawConfig.providers, {});
  const defaultProvider = Object.prototype.hasOwnProperty.call(DEFAULT_AI_CONFIG.providers, rawConfig.defaultProvider)
    ? rawConfig.defaultProvider
    : DEFAULT_AI_CONFIG.defaultProvider;
  return {
    version: DEFAULT_AI_CONFIG.version,
    privacyAccepted: rawConfig.privacyAccepted === true,
    defaultProvider,
    providers: mergedProviders,
    presetTags: Array.isArray(rawConfig.presetTags) ? rawConfig.presetTags : DEFAULT_AI_CONFIG.presetTags
  };
}

function loadAIConfigRaw() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG));
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const data = JSON.parse(content);
    const normalized = normalizeConfig(data);
    normalized.providers = mergeProviders(data.providers, normalized.providers);
    return normalized;
  } catch (error) {
    console.error('Error loading AI config:', error);
    return JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG));
  }
}

function maskConfig(rawConfig) {
  const masked = normalizeConfig(rawConfig);
  for (const key of Object.keys(masked.providers)) {
    const provider = masked.providers[key];
    if (provider.apiKey) {
      provider.apiKey = API_KEY_MASK;
    }
  }
  return masked;
}

function loadAIConfig(options = {}) {
  const { includeSecrets = false } = options;
  const rawConfig = loadAIConfigRaw();
  if (!includeSecrets) {
    return maskConfig(rawConfig);
  }
  const decrypted = normalizeConfig(rawConfig);
  for (const key of Object.keys(decrypted.providers)) {
    const provider = decrypted.providers[key];
    if (provider.apiKey) {
      provider.apiKey = decryptValue(provider.apiKey);
    }
  }
  return decrypted;
}

function saveAIConfig(config) {
  const current = loadAIConfigRaw();
  const incoming = config || {};
  const mergedProviders = mergeProviders(current.providers, incoming.providers || {});
  const incomingProviders = incoming.providers || {};

  for (const key of Object.keys(mergedProviders)) {
    const provider = mergedProviders[key];
    const incomingProvider = incomingProviders[key] || {};
    if (Object.prototype.hasOwnProperty.call(incomingProvider, 'apiKey')) {
      const value = incomingProvider.apiKey;
      if (!value) {
        provider.apiKey = '';
      } else if (isMaskedValue(value)) {
        provider.apiKey = current.providers?.[key]?.apiKey || '';
      } else {
        provider.apiKey = encryptValue(value);
      }
    } else if (current.providers?.[key]?.apiKey && !provider.apiKey) {
      provider.apiKey = current.providers[key].apiKey;
    }
  }

  const defaultProvider = Object.prototype.hasOwnProperty.call(DEFAULT_AI_CONFIG.providers, incoming.defaultProvider)
    ? incoming.defaultProvider
    : current.defaultProvider || DEFAULT_AI_CONFIG.defaultProvider;

  const nextConfig = {
    version: DEFAULT_AI_CONFIG.version,
    privacyAccepted: incoming.privacyAccepted === true ? true : current.privacyAccepted === true,
    defaultProvider,
    providers: mergedProviders,
    presetTags: Array.isArray(incoming.presetTags) ? incoming.presetTags : current.presetTags || DEFAULT_AI_CONFIG.presetTags
  };

  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), 'utf8');
  ensureFilePermissions(configPath);
  return maskConfig(nextConfig);
}

function updatePresetTags(tags) {
  const current = loadAIConfigRaw();
  current.presetTags = Array.isArray(tags) ? tags : DEFAULT_AI_CONFIG.presetTags;
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(current, null, 2), 'utf8');
  ensureFilePermissions(configPath);
  return current.presetTags;
}

function setPrivacyAccepted(accepted) {
  const current = loadAIConfigRaw();
  current.privacyAccepted = accepted === true;
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(current, null, 2), 'utf8');
  ensureFilePermissions(configPath);
  return current.privacyAccepted;
}

function getProviderConfig(providerKey, options = {}) {
  const config = loadAIConfig(options);
  const provider = config.providers?.[providerKey];
  if (!provider) {
    return null;
  }
  return {
    ...provider
  };
}

module.exports = {
  loadAIConfig,
  saveAIConfig,
  updatePresetTags,
  setPrivacyAccepted,
  getProviderConfig,
  DEFAULT_AI_CONFIG,
  API_KEY_MASK
};
