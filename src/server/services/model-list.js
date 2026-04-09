/**
 * 模型列表服务
 * 从渠道 API 获取可用模型列表，支持缓存和回退
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 内存缓存: channelId -> { models: string[], fetchedAt: number }
const modelCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
const FETCH_TIMEOUT = 10000; // 10 秒超时

// 模型名合法字符: 字母、数字、连字符、点、下划线、斜杠、冒号
const MODEL_NAME_REGEX = /^[a-zA-Z0-9\-._/:]+$/;

/**
 * 从指定 URL 获取模型列表
 * @param {string} modelsUrl - 模型列表 URL
 * @param {string} apiKey - API Key
 * @param {number} timeout - 超时时间
 * @returns {Promise<string[]>} 模型名称列表
 */
function fetchModelsFromAPI(modelsUrl, apiKey, timeout = FETCH_TIMEOUT) {
  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(modelsUrl);
    } catch (e) {
      resolve([]);
      return;
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout,
      headers: {
        'Authorization': `Bearer ${apiKey || ''}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CCToolbox/1.0'
      }
    };

    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve([]);
          return;
        }
        try {
          const json = JSON.parse(data);
          const models = parseModelsResponse(json);
          resolve(models);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function buildModelUrls(baseUrl) {
  try {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    const origin = new URL(normalized).origin;

    const candidates = [
      `${normalized}/models`,
      `${origin}/v1/models`,
      /\/v1$/i.test(normalized) ? null : `${normalized}/v1/models`,
      `${origin}/models`
    ];

    const seen = new Set();
    return candidates.filter((url) => {
      if (!url) return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  } catch (error) {
    return [];
  }
}

function fetchFirstSuccessful(urls, apiKey, timeout) {
  return new Promise((resolve) => {
    if (!Array.isArray(urls) || urls.length === 0) {
      resolve([]);
      return;
    }

    let pending = urls.length;
    let resolved = false;

    const settle = (models) => {
      pending -= 1;
      if (!resolved && models.length > 0) {
        resolved = true;
        resolve(models);
        return;
      }
      if (pending === 0 && !resolved) {
        resolve([]);
      }
    };

    for (const url of urls) {
      fetchModelsFromAPI(url, apiKey, timeout)
        .then(settle)
        .catch(() => settle([]));
    }
  });
}

async function fetchModelsWithFallback(baseUrl, apiKey, timeout = FETCH_TIMEOUT) {
  const urls = buildModelUrls(baseUrl);
  if (urls.length === 0) {
    return [];
  }

  for (const url of urls) {
    const models = await fetchModelsFromAPI(url, apiKey, timeout);
    if (models.length > 0) {
      return models;
    }
  }

  return [];
}

/**
 * 解析各种格式的模型列表响应
 * 支持: OpenAI 格式 { data: [{ id: "model-name" }] }
 *       简单格式 { models: ["model-name"] }
 *       Anthropic 格式 { data: [{ name: "model-name" }] }
 */
function parseModelsResponse(json) {
  let rawModels = [];

  if (Array.isArray(json.data)) {
    // OpenAI / Anthropic 格式
    rawModels = json.data.map(item => {
      if (typeof item === 'string') return item;
      return item.id || item.name || item.model || '';
    }).filter(Boolean);
  } else if (Array.isArray(json.models)) {
    // 简单格式
    rawModels = json.models.map(item => {
      if (typeof item === 'string') return item;
      return item.id || item.name || item.model || '';
    }).filter(Boolean);
  }

  // 过滤并验证模型名
  return rawModels.filter(name => {
    if (typeof name !== 'string' || name.length === 0 || name.length > 200) return false;
    return MODEL_NAME_REGEX.test(name);
  });
}

function pushModelIfValid(models, value) {
  if (!value || typeof value !== 'string') return;
  if (!MODEL_NAME_REGEX.test(value)) return;
  if (!models.includes(value)) {
    models.push(value);
  }
}

/**
 * 从渠道配置提取模型列表作为回退
 * 兼容 Claude(modelConfig)、Codex(modelName)、Gemini(model)
 * @param {Object} channel - 渠道对象
 * @returns {string[]} 模型名称列表
 */
function extractModelsFromChannel(channel) {
  if (!channel || typeof channel !== 'object') return [];

  const models = [];

  // 通用字段
  pushModelIfValid(models, channel.modelName);
  pushModelIfValid(models, channel.model);

  // Claude modelConfig 字段
  const modelConfig = channel.modelConfig;
  if (modelConfig && typeof modelConfig === 'object') {
    const fields = ['model', 'haikuModel', 'sonnetModel', 'opusModel'];
    for (const field of fields) {
      pushModelIfValid(models, modelConfig[field]);
    }
  }

  return models;
}

/**
 * 获取渠道可用模型列表（带缓存）
 * @param {Object} channel - 渠道对象
 * @param {string} channelType - 渠道类型
 * @param {boolean} forceRefresh - 是否强制刷新
 * @returns {Promise<{ models: string[], source: string }>}
 */
async function getModelsForChannel(channel, channelType = 'claude', forceRefresh = false) {
  const cacheKey = `${channelType}:${channel.id}`;

  // 检查缓存
  if (!forceRefresh) {
    const cached = modelCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return { models: cached.models, source: 'cache' };
    }
  }

  // 从外部 API 获取
  if (channel.baseUrl && channel.apiKey) {
    const apiModels = await fetchModelsWithFallback(channel.baseUrl, channel.apiKey);
    if (apiModels.length > 0) {
      modelCache.set(cacheKey, { models: apiModels, fetchedAt: Date.now() });
      return { models: apiModels, source: 'api' };
    }
  }

  // 回退: 从渠道配置提取
  const configModels = extractModelsFromChannel(channel);
  if (configModels.length > 0) {
    // 不缓存配置回退结果（可能不完整），但仍然返回
    return { models: configModels, source: 'config' };
  }

  return { models: [], source: 'none' };
}

/**
 * 清除指定渠道的模型缓存
 * @param {string} channelId - 渠道 ID
 */
function clearModelCache(channelId) {
  for (const key of modelCache.keys()) {
    if (key.endsWith(`:${channelId}`)) {
      modelCache.delete(key);
    }
  }
}

module.exports = {
  getModelsForChannel,
  clearModelCache,
  fetchModelsWithFallback
};
