const express = require('express');
const router = express.Router();
const {
  getAllChannels,
  applyChannelToSettings,
  createChannel,
  updateChannel,
  deleteChannel,
  getCurrentSettings,
  getBestChannelForRestore,
  getCurrentChannel,
  validateChannelData
} = require('../services/channels');
const { getSchedulerState } = require('../services/channel-scheduler');
const { getChannelHealthStatus, getAllChannelHealthStatus, resetChannelHealth } = require('../services/channel-health');
const { testChannelSpeed, testMultipleChannels, getLatencyLevel } = require('../services/speed-test');
const { getModelsForChannel, clearModelCache } = require('../services/model-list');
const { broadcastLog, broadcastProxyState, broadcastSchedulerState } = require('../websocket-server');

// Mask apiKey for API responses to prevent credential exposure
function maskApiKey(channel) {
  if (!channel) return null;
  return {
    ...channel,
    apiKey: channel.apiKey ? `${channel.apiKey.slice(0, 4)}${'*'.repeat(Math.max(0, channel.apiKey.length - 4))}` : ''
  };
}

// GET /api/channels - Get all channels with health status
router.get('/', (req, res) => {
  try {
    const channels = getAllChannels();
    // 为每个渠道附加健康状态，并掩码 apiKey
    const channelsWithHealth = channels.map(ch => ({
      ...maskApiKey(ch),
      health: getChannelHealthStatus(ch.id)
    }));
    res.json({ channels: channelsWithHealth });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/pool/status', (req, res) => {
  try {
    const source = req.query.source || 'claude';
    const scheduler = getSchedulerState(source);
    res.json({ source, scheduler });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/channels/current - Get current settings
router.get('/current', (req, res) => {
  try {
    const settings = getCurrentSettings();
    const result = getCurrentChannel();

    // Mask apiKey to prevent credential exposure
    const safeChannel = result.channel
      ? { ...result.channel, apiKey: result.channel.apiKey ? `${result.channel.apiKey.slice(0, 4)}${'*'.repeat(Math.max(0, result.channel.apiKey.length - 4))}` : '' }
      : null;
    const safeSettings = settings
      ? { ...settings, apiKey: settings.apiKey ? `${settings.apiKey.slice(0, 4)}${'*'.repeat(Math.max(0, settings.apiKey.length - 4))}` : '' }
      : null;

    res.json({ channel: safeChannel, settings: safeSettings, warning: result.warning });
  } catch (error) {
    console.error('Error fetching current settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/channels - Create new channel
router.post('/', (req, res) => {
  try {
    const {
      name,
      baseUrl,
      apiKey,
      websiteUrl,
      enabled,
      weight,
      maxConcurrency,
      presetId,
      modelConfig,
      proxyUrl
    } = req.body;

    if (!name || !baseUrl || !apiKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate channel data before creating
    validateChannelData({ name, baseUrl, apiKey });

    const channel = createChannel(name, baseUrl, apiKey, websiteUrl, {
      enabled,
      weight,
      maxConcurrency,
      presetId,
      modelConfig,
      proxyUrl
    });
    res.json({ channel: maskApiKey(channel) });
    broadcastSchedulerState('claude', getSchedulerState('claude'));
  } catch (error) {
    console.error('Error creating channel:', error);
    const statusCode = error.message.includes('required') || error.message.includes('must') || error.message.includes('invalid') || error.message.includes('contains invalid characters') ? 400 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

// GET /api/channels/best-for-restore - Get best channel for restore (must be before /:id)
router.get('/best-for-restore', (req, res) => {
  try {
    const channel = getBestChannelForRestore();
    res.json({ channel: maskApiKey(channel) });
  } catch (error) {
    console.error('Error getting best channel for restore:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/channels/:id/models - Get available models for a channel
router.get('/:id/models', async (req, res) => {
  try {
    const { id } = req.params;
    const forceRefresh = req.query.refresh === 'true';
    const channels = getAllChannels();
    const channel = channels.find(ch => ch.id === id);

    if (!channel) {
      return res.status(404).json({ error: '渠道不存在' });
    }

    const result = await getModelsForChannel(channel, 'claude', forceRefresh);
    res.json({ models: result.models, source: result.source });
  } catch (error) {
    console.error('Error fetching channel models:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/channels/:id - Update channel
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate channel data if name, baseUrl or apiKey are being updated
    // Use 'in' operator to detect explicit updates (including empty strings)
    if ('name' in updates || 'baseUrl' in updates || 'apiKey' in updates) {
      const channels = getAllChannels();
      const existing = channels.find(ch => ch.id === id);
      if (existing) {
        validateChannelData({
          name: 'name' in updates ? updates.name : existing.name,
          baseUrl: 'baseUrl' in updates ? updates.baseUrl : existing.baseUrl,
          apiKey: 'apiKey' in updates ? updates.apiKey : existing.apiKey
        });
      }
    }

    const channel = updateChannel(id, updates);
    res.json({ channel: maskApiKey(channel) });
    broadcastSchedulerState('claude', getSchedulerState('claude'));
  } catch (error) {
    console.error('Error updating channel:', error);
    const statusCode = error.message.includes('required') ||
                     error.message.includes('must') ||
                     error.message.includes('invalid') ||
                     error.message.includes('contains invalid characters')
      ? 400
      : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

// DELETE /api/channels/:id - Delete channel
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = deleteChannel(id);
    res.json(result);
    broadcastSchedulerState('claude', getSchedulerState('claude'));
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/apply-to-settings', async (req, res) => {
  try {
    const { id } = req.params;
    const channel = applyChannelToSettings(id);

    // Check if proxy is running
    const { getProxyStatus } = require('../proxy-server');
    const proxyStatus = getProxyStatus();

    broadcastLog({
      type: 'action',
      action: 'apply_settings',
      message: `已将 (${channel.name}) 渠道写入配置文件中`,
      channelName: channel.name,
      timestamp: Date.now(),
      source: 'claude'
    });

    // Stop proxy if running
    if (proxyStatus && proxyStatus.running) {
      console.log(`Proxy is running, stopping to apply channel settings: ${channel.name}`);

      // Stop proxy and restore backup
      const { stopProxyServer } = require('../proxy-server');
      await stopProxyServer({ clearStartTime: false });

      console.log(`✅ 已停���动态切换，默认使用当前渠道`);
      broadcastLog({
        type: 'action',
        action: 'stop_proxy',
        message: `已停止动态切换，默认使用当前渠道`,
        timestamp: Date.now(),
        source: 'claude'
      });

      // 广播代理状态更新，通知前端代理已停止
      const { broadcastProxyState } = require('../websocket-server');
      broadcastProxyState('claude', {
        running: false,
        port: null,
        runtime: null,
        startTime: null
      }, null, getAllChannels());
    }

    res.json({
      message: `已将 (${channel.name}) 渠道写入配置文件中`,
      channel: maskApiKey(channel)
    });
  } catch (error) {
    console.error('Error applying channel to settings:', error);
    const msg = error.message || '';
    const isValidation = msg.includes('required') || msg.includes('must') ||
                         msg.includes('validation') || msg.includes('failed');
    const isWrite = msg.includes('write') || msg.includes('backup');
    const statusCode = isValidation ? 400 : (isWrite ? 503 : 500);
    res.status(statusCode).json({ error: msg });
  }
});

// POST /api/channels/:id/reset-health - Reset channel health status
router.post('/:id/reset-health', (req, res) => {
  try {
    const { id } = req.params;
    resetChannelHealth(id, 'claude');
    res.json({
      success: true,
      message: '渠道健康状态已重置',
      health: getChannelHealthStatus(id)
    });
  } catch (error) {
    console.error('Error resetting channel health:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/channels/:id/speed-test - Test single channel speed
router.post('/:id/speed-test', async (req, res) => {
  try {
    const { id } = req.params;
    const { timeout = 10000, model } = req.body;
    const channels = getAllChannels();
    const channel = channels.find(ch => ch.id === id);

    if (!channel) {
      return res.status(404).json({ error: '渠道不存在' });
    }

    // 验证 model 参数格式（仅允许安全字符）
    const safeModel = model && typeof model === 'string' && /^[a-zA-Z0-9\-._/:]+$/.test(model)
      ? model.trim()
      : undefined;

    // Claude 渠道使用 'claude' 类型
    const result = await testChannelSpeed(channel, timeout, 'claude', safeModel);
    result.level = getLatencyLevel(result.latency);
    if (safeModel) {
      result.testedModel = safeModel;
    }

    res.json(result);
  } catch (error) {
    console.error('Error testing channel speed:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/channels/speed-test-all - Test all channels speed
router.post('/speed-test-all', async (req, res) => {
  try {
    const { timeout = 10000 } = req.body;
    const channels = getAllChannels();

    if (channels.length === 0) {
      return res.json({ results: [], message: '没有可测试的渠道' });
    }

    // Claude 渠道使用 'claude' 类型
    const results = await testMultipleChannels(channels, timeout, 'claude');
    // 添加延迟等级
    results.forEach(r => {
      r.level = getLatencyLevel(r.latency);
    });

    res.json({
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        avgLatency: calculateAvgLatency(results)
      }
    });
  } catch (error) {
    console.error('Error testing all channels speed:', error);
    res.status(500).json({ error: error.message });
  }
});

// 计算平均延迟
function calculateAvgLatency(results) {
  const successResults = results.filter(r => r.success && r.latency);
  if (successResults.length === 0) return null;
  const sum = successResults.reduce((acc, r) => acc + r.latency, 0);
  return Math.round(sum / successResults.length);
}

module.exports = router;
