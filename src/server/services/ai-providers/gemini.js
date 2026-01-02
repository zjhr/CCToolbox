const { AIServiceError } = require('../ai-errors');

function getApiBase(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/v1(beta)?(\/|$)/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/v1beta`;
}

class GeminiProvider {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl;
    this.modelName = config.modelName;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs || 30000;
  }

  async requestJson(url, body) {
    if (!this.baseUrl) {
      throw new AIServiceError('缺少 Gemini Base URL', 'GEMINI_CONFIG_ERROR', 400);
    }
    if (!this.apiKey) {
      throw new AIServiceError('缺少 Gemini API Key', 'GEMINI_CONFIG_ERROR', 400);
    }
    if (!this.modelName) {
      throw new AIServiceError('缺少 Gemini 模型名称', 'GEMINI_CONFIG_ERROR', 400);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = null;
      }
      if (!response.ok) {
        const message = data?.error?.message || text || 'Gemini 请求失败';
        throw new AIServiceError(message, 'GEMINI_REQUEST_ERROR', response.status, data);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  buildPayload(messages, options) {
    const systemMessages = messages.filter((item) => item.role === 'system');
    const contentMessages = messages.filter((item) => item.role !== 'system');

    const contents = contentMessages.map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(item.content || '') }]
    }));

    const payload = {
      contents
    };

    if (systemMessages.length > 0) {
      const systemText = systemMessages.map((item) => item.content).join('\n\n');
      payload.systemInstruction = {
        role: 'system',
        parts: [{ text: systemText }]
      };
    }

    const generationConfig = {};
    if (typeof options.maxTokens === 'number') {
      generationConfig.maxOutputTokens = options.maxTokens;
    }
    if (typeof options.temperature === 'number') {
      generationConfig.temperature = options.temperature;
    }
    if (Object.keys(generationConfig).length > 0) {
      payload.generationConfig = generationConfig;
    }
    return payload;
  }

  async generateText(options = {}) {
    const { messages, maxTokens, temperature } = options;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AIServiceError('缺少对话消息', 'GEMINI_REQUEST_ERROR', 400);
    }
    const payload = this.buildPayload(messages, { maxTokens, temperature });
    const apiBase = getApiBase(this.baseUrl);
    const modelName = encodeURIComponent(this.modelName);
    const url = `${apiBase}/models/${modelName}:generateContent?key=${this.apiKey}`;
    const data = await this.requestJson(url, payload);
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!content) {
      throw new AIServiceError('Gemini 返回内容为空', 'GEMINI_EMPTY_RESPONSE', 502);
    }
    return {
      text: content.trim(),
      model: this.modelName
    };
  }
}

module.exports = {
  GeminiProvider
};
