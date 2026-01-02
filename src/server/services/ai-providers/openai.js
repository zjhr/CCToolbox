const { AIServiceError } = require('../ai-errors');

function buildUrl(baseUrl, path) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}${path}`;
}

class OpenAIProvider {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl;
    this.modelName = config.modelName;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs || 30000;
  }

  async requestJson(url, body) {
    if (!this.baseUrl) {
      throw new AIServiceError('缺少 OpenAI Base URL', 'OPENAI_CONFIG_ERROR', 400);
    }
    if (!this.apiKey) {
      throw new AIServiceError('缺少 OpenAI API Key', 'OPENAI_CONFIG_ERROR', 400);
    }
    if (!this.modelName) {
      throw new AIServiceError('缺少 OpenAI 模型名称', 'OPENAI_CONFIG_ERROR', 400);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
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
        const message = data?.error?.message || text || 'OpenAI 请求失败';
        throw new AIServiceError(message, 'OPENAI_REQUEST_ERROR', response.status, data);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateText(options = {}) {
    const { messages, maxTokens, temperature } = options;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AIServiceError('缺少对话消息', 'OPENAI_REQUEST_ERROR', 400);
    }
    const payload = {
      model: this.modelName,
      messages
    };
    if (typeof maxTokens === 'number') {
      payload.max_tokens = maxTokens;
    }
    if (typeof temperature === 'number') {
      payload.temperature = temperature;
    }
    const data = await this.requestJson(buildUrl(this.baseUrl, '/chat/completions'), payload);
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new AIServiceError('OpenAI 返回内容为空', 'OPENAI_EMPTY_RESPONSE', 502);
    }
    return {
      text: content.trim(),
      model: this.modelName
    };
  }
}

module.exports = {
  OpenAIProvider
};
