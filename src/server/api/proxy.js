const express = require('express');
const router = express.Router();
const { startProxyServer, stopProxyServer, getProxyStatus } = require('../proxy-server');
const {
  setProxyConfig,
  restoreSettings,
  isProxyConfig,
  getCurrentProxyPort,
  settingsExists,
  hasBackup,
  clearBackup,
  readSettings,
  getBackupPath
} = require('../services/settings-manager');
const { getAllChannels } = require('../services/channels');
const { clearAllLogs } = require('../websocket-server');
const { getAppDir } = require('../../utils/app-path-manager');
const { setProxyEnabled } = require('../services/proxy-runtime');
const fs = require('fs');
const path = require('path');

function sanitizeChannelForResponse(channel) {
  if (!channel) return null;
  return {
    id: channel.id,
    name: channel.name,
    baseUrl: channel.baseUrl,
    websiteUrl: channel.websiteUrl
  };
}

// 保存激活渠道ID
function saveActiveChannelId(channelId) {
  const dir = getAppDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, 'active-channel.json');
  fs.writeFileSync(filePath, JSON.stringify({ activeChannelId: channelId }, null, 2), 'utf8');
}

function extractApiKeyFromSettings(settings) {
  let apiKey = settings?.env?.ANTHROPIC_API_KEY ||
               settings?.env?.ANTHROPIC_AUTH_TOKEN ||
               '';

  // 如果 apiKey 仍为空，尝试从 apiKeyHelper 提取
  if (!apiKey && settings?.apiKeyHelper) {
    const match = settings.apiKeyHelper.match(/['"]([^'"]+)['"]/);
    if (match && match[1]) {
      apiKey = match[1];
    }
  }

  // 代理占位 key 不当作真实渠道凭证
  if (apiKey === 'PROXY_KEY') {
    return '';
  }
  return apiKey;
}

function matchChannelByBaseUrlAndKey(baseUrl, apiKey, channels = getAllChannels()) {
  if (!baseUrl || !apiKey || baseUrl.includes('127.0.0.1')) {
    return null;
  }
  return channels.find(ch => ch.baseUrl === baseUrl && ch.apiKey === apiKey) || null;
}

// 从 settings.json 找到当前激活的渠道
function findActiveChannelFromSettings() {
  try {
    const settings = readSettings();
    const baseUrl = settings?.env?.ANTHROPIC_BASE_URL || '';
    const apiKey = extractApiKeyFromSettings(settings);
    return matchChannelByBaseUrlAndKey(baseUrl, apiKey);
  } catch (err) {
    console.error('Error finding active channel:', err);
    return null;
  }
}

function loadSavedActiveChannelId() {
  try {
    const filePath = path.join(getAppDir(), 'active-channel.json');
    if (!fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data?.activeChannelId || null;
  } catch (err) {
    return null;
  }
}

function findChannelFromBackupSettings() {
  try {
    if (!hasBackup()) return null;
    const content = fs.readFileSync(getBackupPath(), 'utf8');
    const settings = JSON.parse(content);
    const baseUrl = settings?.env?.ANTHROPIC_BASE_URL || '';
    const apiKey = extractApiKeyFromSettings(settings);
    return matchChannelByBaseUrlAndKey(baseUrl, apiKey);
  } catch (err) {
    return null;
  }
}

/**
 * 启动代理时解析渠道：
 * 1) 当前 settings 真实渠道
 * 2) active-channel.json
 * 3) 备份 settings
 * 4) 第一个启用渠道
 */
function resolveChannelForProxyStart() {
  const channels = getAllChannels();
  const enabled = channels.filter(ch => ch.enabled !== false);

  const fromSettings = findActiveChannelFromSettings();
  if (fromSettings) return fromSettings;

  const savedId = loadSavedActiveChannelId();
  if (savedId) {
    const saved = channels.find(ch => ch.id === savedId);
    if (saved && saved.enabled !== false) return saved;
  }

  const fromBackup = findChannelFromBackupSettings();
  if (fromBackup && fromBackup.enabled !== false) return fromBackup;

  return enabled[0] || null;
}

// 获取代理状态
router.get('/status', (req, res) => {
  try {
    const proxyStatus = getProxyStatus();
    const channels = getAllChannels();
    const configStatus = {
      isProxyConfig: isProxyConfig(),
      settingsExists: settingsExists(),
      hasBackup: hasBackup(),
      currentProxyPort: getCurrentProxyPort()
    };

    // 页面重开时需要 activeChannel 回显
    let activeChannel = null;
    const savedId = loadSavedActiveChannelId();
    if (savedId) {
      activeChannel = channels.find(ch => ch.id === savedId) || null;
    }
    if (!activeChannel) {
      activeChannel = resolveChannelForProxyStart();
    }

    res.json({
      proxy: proxyStatus,
      config: configStatus,
      activeChannel: sanitizeChannelForResponse(activeChannel),
      channelsCount: channels.length,
      enabledChannelsCount: channels.filter(ch => ch.enabled !== false).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动代理
router.post('/start', async (req, res) => {
  try {
    // 1. 检查配置文件是否存在
    if (!settingsExists()) {
      return res.status(400).json({
        error: 'Claude Code settings.json not found. Please run Claude Code at least once.'
      });
    }

    // 2. 解析启动渠道（兼容重启后残留 proxy settings）
    const currentChannel = resolveChannelForProxyStart();
    if (!currentChannel) {
      return res.status(400).json({
        error: '无法识别可用渠道。请先创建并启用至少一个渠道。'
      });
    }

    // 3. 保存当前激活渠道ID（用于代理模式）
    saveActiveChannelId(currentChannel.id);
    console.log(`✅ Saved active channel: ${currentChannel.name} (${currentChannel.id})`);

    // 4. 启动代理服务器
    const proxyResult = await startProxyServer();

    if (!proxyResult.success) {
      return res.status(500).json({ error: 'Failed to start proxy server' });
    }

    // 5. 设置代理配置（备份并修改 settings.json 中的代理字段）
    setProxyConfig(proxyResult.port);

    // 6. 记录显式开启意图（与渠道 backup / active-channel 解耦）
    setProxyEnabled('claude', true);

    const updatedStatus = getProxyStatus();
    const channels = getAllChannels();
    const activeChannel = channels.find(ch => ch.enabled !== false);

    // 7. 通过 WebSocket 推送代理状态更新
    const { broadcastProxyState } = require('../websocket-server');
    broadcastProxyState('claude', updatedStatus, activeChannel, channels);

    res.json({
      success: true,
      port: proxyResult.port,
      activeChannel: sanitizeChannelForResponse(currentChannel),
      message: `代理已启动在端口 ${proxyResult.port}，当前渠道: ${currentChannel.name}`
    });
  } catch (error) {
    console.error('Error starting proxy:', error);
    res.status(500).json({ error: error.message });
  }
});

// 停止代理
router.post('/stop', async (req, res) => {
  try {
    // 1. 停止代理服务器
    const proxyResult = await stopProxyServer();

    // 2. 恢复配置（优先从备份，否则选择权重最高的启用渠道）
    let restoredChannel = null;

    // 优先尝试从备份恢复
    if (hasBackup()) {
      restoreSettings();
      console.log('✅ Restored settings from backup');

      // 尝试找到匹配的渠道
      const channels = getAllChannels();
      const currentSettings = require('../services/channels').getCurrentSettings();
      if (currentSettings) {
        restoredChannel = channels.find(ch =>
          ch.baseUrl === currentSettings.baseUrl && ch.apiKey === currentSettings.apiKey
        );
      }
    } else {
      // 没有备份，选择权重最高的启用渠道
      const { getBestChannelForRestore, updateClaudeSettingsForChannel } = require('../services/channels');
      restoredChannel = getBestChannelForRestore();

      if (restoredChannel) {
        updateClaudeSettingsForChannel(restoredChannel);
        console.log(`✅ Restored settings to best channel: ${restoredChannel.name}`);
      }
    }

    // 3. 清理残留备份；active-channel.json 也用于“写入渠道配置”，不能随停代理删掉
    if (hasBackup()) {
      clearBackup();
      console.log('✅ Removed backup file');
    }

    // 4. 清除显式开启标记，防止 UI/服务重启后误自动拉起
    setProxyEnabled('claude', false);

    // 5. 通过 WebSocket 推送代理状态更新
    const { broadcastProxyState } = require('../websocket-server');
    const updatedStatus = getProxyStatus();
    const channels = getAllChannels();
    broadcastProxyState('claude', updatedStatus, null, channels);

    if (restoredChannel) {
      res.json({
        success: true,
        message: `代理已停止，配置已恢复到渠道: ${restoredChannel.name}`,
        port: proxyResult.port,
        restoredChannel: restoredChannel.name
      });
    } else {
      res.json({
        success: true,
        message: '代理已停止（无配置可恢复）',
        port: proxyResult.port
      });
    }
  } catch (error) {
    console.error('Error stopping proxy:', error);
    res.status(500).json({ error: error.message });
  }
});

// 清空日志
router.post('/logs/clear', (req, res) => {
  try {
    clearAllLogs();
    res.json({ success: true, message: '日志已清空' });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.findActiveChannelFromSettings = findActiveChannelFromSettings;
module.exports.resolveChannelForProxyStart = resolveChannelForProxyStart;
