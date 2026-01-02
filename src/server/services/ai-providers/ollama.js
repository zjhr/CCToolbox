const { AIServiceError } = require('../ai-errors');

function buildUrl(baseUrl, path) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}${path}`;
}

class OllamaProvider {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl;
    this.modelName = config.modelName;
    this.timeoutMs = config.timeoutMs || 30000;
  }

  async requestJson(url, body) {
    if (!this.baseUrl) {
      throw new AIServiceError('缺少 Ollama Base URL', 'OLLAMA_CONFIG_ERROR', 400);
    }
    if (!this.modelName) {
      throw new AIServiceError('缺少 Ollama 模型名称', 'OLLAMA_CONFIG_ERROR', 400);
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
        const message = data?.error || text || 'Ollama 请求失败';
        throw new AIServiceError(message, 'OLLAMA_REQUEST_ERROR', response.status, data);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateText(options = {}) {
    const { messages, maxTokens, temperature } = options;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new AIServiceError('缺少对话消息', 'OLLAMA_REQUEST_ERROR', 400);
    }
    const payload = {
      model: this.modelName,
      messages,
      stream: false
    };
    if (typeof temperature === 'number') {
      payload.options = { ...payload.options, temperature };
    }
    if (typeof maxTokens === 'number') {
      payload.options = { ...payload.options, num_predict: maxTokens };
    }
    const data = await this.requestJson(buildUrl(this.baseUrl, '/api/chat'), payload);
    const content = data?.message?.content || data?.response || '';
    if (!content) {
      throw new AIServiceError('Ollama 返回内容为空', 'OLLAMA_EMPTY_RESPONSE', 502);
    }
    return {
      text: content.trim(),
      model: this.modelName
    };
  }
}

module.exports = {
  OllamaProvider
};
