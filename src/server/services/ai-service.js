const { loadAIConfig } = require('./ai-config');
const { AIServiceError } = require('./ai-errors');
const { OllamaProvider } = require('./ai-providers/ollama');
const { OpenAIProvider } = require('./ai-providers/openai');
const { GeminiProvider } = require('./ai-providers/gemini');

class AIServiceManager {
  constructor() {
    this.providerFactories = {
      ollama: (config) => new OllamaProvider(config),
      openai: (config) => new OpenAIProvider(config),
      gemini: (config) => new GeminiProvider(config)
    };
  }

  resolveProvider(providerKey, config) {
    const resolvedKey = providerKey || config.defaultProvider;
    const providerConfig = config.providers?.[resolvedKey];
    if (!providerConfig) {
      throw new AIServiceError('未找到 AI 提供商配置', 'PROVIDER_NOT_FOUND', 400);
    }
    if (providerConfig.enabled === false) {
      throw new AIServiceError('AI 提供商未启用', 'PROVIDER_DISABLED', 400);
    }
    return { providerKey: resolvedKey, providerConfig };
  }

  createProvider(providerKey, providerConfig, options = {}) {
    const factory = this.providerFactories[providerKey];
    if (!factory) {
      throw new AIServiceError('不支持的 AI 提供商', 'PROVIDER_UNSUPPORTED', 400);
    }
    return factory({
      ...providerConfig,
      timeoutMs: options.timeoutMs || 30000
    });
  }

  async requestCompletion(options = {}) {
    const config = loadAIConfig({ includeSecrets: true });
    const { providerKey, providerConfig } = this.resolveProvider(options.providerKey, config);
    const provider = this.createProvider(providerKey, providerConfig, options);
    const result = await provider.generateText({
      messages: options.messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature
    });
    return {
      ...result,
      provider: providerKey
    };
  }

  async testConnection(providerKey, providerConfig) {
    const config = loadAIConfig({ includeSecrets: true });
    const providerKeyResolved = providerKey || config.defaultProvider;
    const effectiveConfig = providerConfig || config.providers?.[providerKeyResolved];
    if (!effectiveConfig) {
      throw new AIServiceError('未找到 AI 提供商配置', 'PROVIDER_NOT_FOUND', 400);
    }
    if (effectiveConfig.enabled === false) {
      throw new AIServiceError('AI 提供商未启用', 'PROVIDER_DISABLED', 400);
    }
    const provider = this.createProvider(providerKeyResolved, effectiveConfig, { timeoutMs: 30000 });
    const result = await provider.generateText({
      messages: [{ role: 'user', content: '请仅回复 "pong"' }],
      maxTokens: 16,
      temperature: 0
    });
    return {
      ok: true,
      provider: providerKeyResolved,
      model: result.model
    };
  }
}

let instance = null;

function getAIServiceManager() {
  if (!instance) {
    instance = new AIServiceManager();
  }
  return instance;
}

module.exports = {
  AIServiceManager,
  getAIServiceManager
};
