const { getAllChannels } = require('./channels');
const { getChannels: getCodexChannels } = require('./codex-channels');
const { getChannels: getGeminiChannels } = require('./gemini-channels');
const { isChannelAvailable, getChannelHealthStatus, setOnChannelFrozen } = require('./channel-health');
const { extractModelsFromChannel, getCachedModelsSync, primeModelsCache } = require('./model-list');

const channelProviders = {
  claude: () => getAllChannels(),
  codex: () => {
    const data = getCodexChannels();
    return Array.isArray(data?.channels) ? data.channels : [];
  },
  gemini: () => {
    const data = getGeminiChannels();
    return Array.isArray(data?.channels) ? data.channels : [];
  }
};

/**
 * 规范化模型 ID，去掉 Claude Code 的 [1m] 等上下文后缀
 * @param {string|null|undefined} modelId
 * @returns {string}
 */
function normalizeModelIdForMatch(modelId) {
  if (!modelId || typeof modelId !== 'string') return '';
  return modelId.trim().replace(/\[[^\]]*\]\s*$/g, '').trim();
}

/**
 * 获取渠道声明/已缓存的上游模型列表（用于调度选渠道，零阻塞）
 * 优先用已缓存的上游真实模型（更准确），回退到渠道配置声明
 * @param {Object} channel
 * @param {string} channelType
 * @returns {string[]}
 */
function getChannelKnownModels(channel, channelType = 'claude') {
  // 优先读上游真实模型缓存（后台预热填充，零阻塞）
  const cached = getCachedModelsSync(channel, channelType);
  if (cached && cached.length) return cached;
  // 回退：渠道配置声明的模型
  return extractModelsFromChannel(channel);
}

/**
 * 渠道是否声明了可用模型列表
 * @param {Object} channel
 * @returns {boolean}
 */
function channelDeclaresModels(channel) {
  return getChannelKnownModels(channel).length > 0;
}

/**
 * 渠道是否支持指定模型（忽略 [1m] 后缀）
 * @param {Object} channel
 * @param {string} modelId
 * @returns {boolean}
 */
function channelSupportsModel(channel, modelId) {
  const target = normalizeModelIdForMatch(modelId);
  if (!target) return false;
  const models = getChannelKnownModels(channel);
  if (!models.length) return false;
  const normalizedTarget = target.toLowerCase();
  return models.some((name) => {
    const normalized = normalizeModelIdForMatch(name).toLowerCase();
    return normalized === normalizedTarget;
  });
}

/**
 * 按模型偏好过滤渠道
 * - 有渠道支持该模型时：严格只保留支持的渠道
 * - 有渠道已知模型数据但全不匹配，且无任何上游真实模型缓存时：
 *   保留旧行为回退全部（配置声明只是 hint，可能漏列，避免误杀合法请求）
 * - 有渠道已缓存上游真实模型但全不匹配时：上游确实都不支持，返回空，
 *   避免把请求路由到明确不支持该模型的渠道（偶发 model not found 根因）
 * - 所有渠道都无模型数据时：无法判断，返回全部（不限制）
 * @param {Object[]} channels
 * @param {string|null|undefined} modelId
 * @returns {Object[]}
 */
function preferChannelsForModel(channels, modelId) {
  if (!Array.isArray(channels) || !channels.length) return [];
  const target = normalizeModelIdForMatch(modelId);
  if (!target) return channels.slice();

  const declaring = channels.filter(channelDeclaresModels);
  // 没有任何渠道已知模型数据时，无法判断，不限制
  if (!declaring.length) return channels.slice();

  const matched = channels.filter((ch) => channelSupportsModel(ch, target));
  if (matched.length) return matched;

  // 至少有一个渠道已缓存上游真实模型时，以缓存为准：全不匹配说明上游确实都不支持，
  // 不回退全部候选，避免路由到不支持该模型的渠道触发 model not found。
  const hasUpstreamCache = channels.some(
    (ch) => Array.isArray(getCachedModelsSync(ch, 'claude')) && getCachedModelsSync(ch, 'claude').length > 0
  );
  if (hasUpstreamCache) return [];

  // 仅有配置声明 hint、无上游缓存时：配置可能漏列，保留旧行为回退全部，避免误杀合法请求
  return channels.slice();
}

function createState() {
  return {
    channels: [],
    inflight: new Map(),
    sessionBindings: new Map(),
    queue: []
  };
}

const schedulerStates = {
  claude: createState(),
  codex: createState(),
  gemini: createState()
};

function getState(source = 'claude') {
  if (!schedulerStates[source]) {
    schedulerStates[source] = createState();
  }
  return schedulerStates[source];
}

const WAIT_TIMEOUT_MS = 15000;

/**
 * 解绑指定渠道的所有会话
 */
function unbindChannelSessions(source, channelId) {
  const state = getState(source);
  let unbindCount = 0;
  for (const [sessionId, boundChannelId] of state.sessionBindings) {
    if (boundChannelId === channelId) {
      state.sessionBindings.delete(sessionId);
      unbindCount++;
    }
  }
  if (unbindCount > 0) {
    console.log(`[ChannelScheduler] Unbound ${unbindCount} sessions from ${source} channel ${channelId}`);
  }
}

// 注册冻结回调，当渠道被冻结时解绑其会话
setOnChannelFrozen(unbindChannelSessions);

function refreshChannels(source = 'claude') {
  const state = getState(source);
  const provider = channelProviders[source];
  if (!provider) return;

  // 每次直接读取最新配置，不做缓存
  const raw = provider();
  state.channels = raw
    .filter(ch => ch.enabled !== false)
    .map(ch => ({
      id: ch.id,
      name: ch.name,
      baseUrl: ch.baseUrl,
      apiKey: ch.apiKey,
      weight: Math.max(1, Number(ch.weight) || 1),
      maxConcurrency: ch.maxConcurrency ?? null,
      // 保留模型声明，供按 model 选渠道
      model: ch.model,
      modelName: ch.modelName,
      modelConfig: ch.modelConfig,
      customModels: ch.customModels
    }));

  state.channels.forEach(ch => {
    if (!state.inflight.has(ch.id)) {
      state.inflight.set(ch.id, 0);
    }
  });

  // 后台预热各渠道上游真实模型缓存（不阻塞分配，失败静默）
  // 缓存命中后，channelSupportsModel 即可基于上游真实模型严格过滤
  state.channels.forEach(ch => {
    if (ch.baseUrl && ch.apiKey && !getCachedModelsSync(ch, source)) {
      primeModelsCache(ch, source).catch(() => {});
    }
  });
}

function getAvailableChannels(source = 'claude') {
  refreshChannels(source);
  const state = getState(source);
  return state.channels.filter(ch => {
    if (!isChannelAvailable(ch.id, source)) {
      return false;
    }
    if (ch.maxConcurrency === null) {
      return true;
    }
    return (state.inflight.get(ch.id) || 0) < ch.maxConcurrency;
  });
}

function pickWeightedChannel(channels) {
  if (!channels.length) return null;
  const totalWeight = channels.reduce((sum, ch) => sum + ch.weight, 0);
  let threshold = Math.random() * totalWeight;
  for (const channel of channels) {
    threshold -= channel.weight;
    if (threshold <= 0) {
      return channel;
    }
  }
  return channels[channels.length - 1];
}

function tryAllocate(source = 'claude', options = {}) {
  const state = getState(source);
  const sessionId = options.sessionId;
  const enableSessionBinding = options.enableSessionBinding !== false; // 默认开启
  const requestedModel = options.model || null;
  let available = getAvailableChannels(source);
  if (!available.length) {
    return null;
  }

  // Claude：按请求 model 优先选支持该模型的渠道
  if (source === 'claude' && requestedModel) {
    available = preferChannelsForModel(available, requestedModel);
  }
  if (!available.length) {
    return null;
  }

  // 如果启用会话绑定且已有绑定，优先使用绑定渠道
  if (enableSessionBinding && sessionId && state.sessionBindings.has(sessionId)) {
    const boundId = state.sessionBindings.get(sessionId);
    const boundChannel = available.find(ch => ch.id === boundId);
    if (boundChannel) {
      // 绑定渠道若不支持当前模型，则解绑并重新分配
      if (
        source === 'claude' &&
        requestedModel &&
        channelDeclaresModels(boundChannel) &&
        !channelSupportsModel(boundChannel, requestedModel)
      ) {
        state.sessionBindings.delete(sessionId);
      } else {
        state.inflight.set(boundChannel.id, (state.inflight.get(boundChannel.id) || 0) + 1);
        return boundChannel;
      }
    }
  }

  // 选择新的渠道（加权随机）
  const chosen = pickWeightedChannel(available);
  if (!chosen) return null;

  // 只有在启用会话绑定时才记录绑定
  if (enableSessionBinding && sessionId) {
    state.sessionBindings.set(sessionId, chosen.id);
  }
  state.inflight.set(chosen.id, (state.inflight.get(chosen.id) || 0) + 1);
  return chosen;
}

function drainQueue(source = 'claude') {
  const state = getState(source);
  if (!state.queue.length) return;

  for (let i = 0; i < state.queue.length; i++) {
    const entry = state.queue[i];
    const channel = tryAllocate(source, entry.options);
    if (channel) {
      clearTimeout(entry.timer);
      state.queue.splice(i, 1);
      entry.resolve(channel);
      return drainQueue(source);
    }
  }
}

function allocateChannel(options = {}) {
  const source = options.source || 'claude';
  const state = getState(source);
  const channel = tryAllocate(source, options);
  if (channel) {
    return Promise.resolve(channel);
  }

  if (!state.channels.length) {
    return Promise.reject(new Error('暂无可用渠道，请先添加并启用至少一个渠道'));
  }

  // 检查是否所有渠道都被冻结
  const allFrozen = state.channels.every(ch => !isChannelAvailable(ch.id, source));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = state.queue.findIndex(item => item.timer === timer);
      if (index !== -1) {
        state.queue.splice(index, 1);
      }
      // 根据实际情况返回更准确的错误信息
      if (allFrozen) {
        reject(new Error('所有渠道均已被冻结，请等待健康检查恢复或手动重置'));
      } else {
        reject(new Error('所有渠道均已达到并发上限，请稍后重试'));
      }
    }, WAIT_TIMEOUT_MS);

    state.queue.push({
      source,
      options,
      resolve,
      reject,
      timer
    });
  });
}

function releaseChannel(channelId, source = 'claude') {
  const state = getState(source);
  if (!channelId) return;
  if (!state.inflight.has(channelId)) {
    state.inflight.set(channelId, 0);
  }
  const current = state.inflight.get(channelId) || 0;
  state.inflight.set(channelId, current > 0 ? current - 1 : 0);
  drainQueue(source);
}

function getSchedulerState(source = 'claude') {
  refreshChannels(source);
  const state = getState(source);
  return {
    channels: state.channels.map(ch => {
      const healthStatus = getChannelHealthStatus(ch.id, source);
      return {
        id: ch.id,
        name: ch.name,
        weight: ch.weight,
        maxConcurrency: ch.maxConcurrency,
        inflight: state.inflight.get(ch.id) || 0,
        health: healthStatus
      };
    }),
    pending: state.queue.length
  };
}

module.exports = {
  allocateChannel,
  releaseChannel,
  getSchedulerState,
  normalizeModelIdForMatch,
  channelDeclaresModels,
  channelSupportsModel,
  preferChannelsForModel
};
