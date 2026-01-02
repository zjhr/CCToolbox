class AIServiceError extends Error {
  constructor(message, code = 'AI_SERVICE_ERROR', status = 500, detail = null) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function normalizeAIError(error) {
  if (error instanceof AIServiceError) {
    return error;
  }
  if (error?.name === 'AbortError') {
    return new AIServiceError('请求超时', 'REQUEST_TIMEOUT', 504);
  }
  return new AIServiceError(error?.message || 'AI 请求失败', 'AI_SERVICE_ERROR', 500);
}

module.exports = {
  AIServiceError,
  normalizeAIError
};
