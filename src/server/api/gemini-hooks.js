const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const { getAppDir } = require('../../utils/app-path-manager');
const { getGeminiDir, loadSettings } = require('../services/gemini-config');

// Gemini settings.json 路径
const GEMINI_SETTINGS_PATH = path.join(getGeminiDir(), 'settings.json');

// UI 配置路径（记录用户是否主动关闭过、飞书配置等）
function getUiConfigPath() {
  return path.join(getAppDir(), 'ui-config.json');
}

// 通知脚本路径（Gemini 渠道）
function getNotifyScriptPath() {
  return path.join(getAppDir(), 'gemini-notify-hook.js');
}

// 检测操作系统
const platform = os.platform(); // 'darwin' | 'win32' | 'linux'

// 读取 Gemini settings.json
function readGeminiSettings() {
  return loadSettings();
}

// 写入 Gemini settings.json
function writeGeminiSettings(settings) {
  try {
    const dir = path.dirname(GEMINI_SETTINGS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(GEMINI_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write Gemini settings:', error);
    return false;
  }
}

// 读取 UI 配置
function readUIConfig() {
  try {
    const configPath = getUiConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
    return {};
  } catch (error) {
    return {};
  }
}

// 写入 UI 配置
function writeUIConfig(config) {
  try {
    const configPath = getUiConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write UI config:', error);
    return false;
  }
}

// 生成系统通知命令（跨平台）
function generateSystemNotificationCommand(type, channelLabel = 'Gemini CLI') {
  const completeText = `${channelLabel} 任务已完成 | 等待交互`;

  if (platform === 'darwin') {
    if (type === 'dialog') {
      return `osascript -e 'display dialog "${completeText}" with title "CCToolbox" buttons {"好的"} default button 1 with icon note'`;
    }

    return `if command -v terminal-notifier &>/dev/null; then terminal-notifier -title "CCToolbox" -message "${completeText}" -sound Glass -activate com.apple.Terminal; else osascript -e 'display notification "${completeText}" with title "CCToolbox" sound name "Glass"'; fi`;
  }

  if (platform === 'win32') {
    if (type === 'dialog') {
      return `powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${completeText}', 'CCToolbox', 'OK', 'Information')"`;
    }
    return `powershell -Command "$wshell = New-Object -ComObject Wscript.Shell; $wshell.Popup('${completeText}', 5, 'CCToolbox', 0x40)"`;
  }

  if (type === 'dialog') {
    return `zenity --info --title="CCToolbox" --text="${completeText}" 2>/dev/null || notify-send "CCToolbox" "${completeText}"`;
  }
  return `notify-send "CCToolbox" "${completeText}"`;
}

// 生成通知脚本内容（支持系统通知 + 飞书通知）
function generateNotifyScript(config, channel = 'gemini') {
  const { systemNotification, feishu } = config;
  const channelLabel = channel === 'gemini' ? 'Gemini CLI' : 'Claude Code';

  let script = `#!/usr/bin/env node
// CCToolbox 通知脚本 - 自动生成，请勿手动修改
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const os = require('os');

const timestamp = new Date().toLocaleString('zh-CN');

`;

  if (systemNotification && systemNotification.enabled) {
    const cmd = generateSystemNotificationCommand(systemNotification.type, channelLabel);
    script += `// 系统通知
try {
  execSync(${JSON.stringify(cmd)}, { stdio: 'ignore' });
} catch (e) {
  console.error('系统通知失败:', e.message);
}

`;
  }

  if (feishu && feishu.enabled && feishu.webhookUrl) {
    script += `// 飞书通知
const feishuUrl = ${JSON.stringify(feishu.webhookUrl)};
const feishuData = JSON.stringify({
  msg_type: 'interactive',
  card: {
    header: {
      title: { tag: 'plain_text', content: '🎉 CCToolbox - 任务完成' },
      template: 'green'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: '**状态**: ${channelLabel} 任务已完成 | 等待交互' }
      },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: '**时间**: ' + timestamp }
      },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: '**设备**: ' + os.hostname() }
      }
    ]
  }
});

try {
  const urlObj = new URL(feishuUrl);
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(feishuData)
    },
    timeout: 10000
  };

  const reqModule = urlObj.protocol === 'https:' ? https : http;
  const req = reqModule.request(options, () => {
    // 忽略响应
  });
  req.on('error', (e) => {
    console.error('飞书通知失败:', e.message);
  });
  req.write(feishuData);
  req.end();
} catch (e) {
  console.error('飞书通知失败:', e.message);
}
`;
  }

  return script;
}

// 写入通知脚本
function writeNotifyScript(config) {
  try {
    const notifyPath = getNotifyScriptPath();
    const dir = path.dirname(notifyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const script = generateNotifyScript(config, 'gemini');
    fs.writeFileSync(notifyPath, script, { mode: 0o755 });
    return true;
  } catch (error) {
    console.error('Failed to write notify script:', error);
    return false;
  }
}

// 从现有 hooks 配置中解析 AfterAgent hook 状态
function parseAfterAgentHookStatus(settings) {
  const hooks = settings.hooks;
  if (!hooks || !hooks.AfterAgent || !Array.isArray(hooks.AfterAgent) || hooks.AfterAgent.length === 0) {
    return { enabled: false, type: 'notification' };
  }

  // Gemini hooks 是嵌套结构: AfterAgent[i].hooks[j].command
  for (const entry of hooks.AfterAgent) {
    const innerHooks = entry.hooks || [];
    for (const inner of innerHooks) {
      const command = inner.command || '';

      const isDialog = command.includes('display dialog') ||
                       command.includes('MessageBox') ||
                       command.includes('zenity --info');
      const isNotification = command.includes('display notification') ||
                             command.includes('Popup') ||
                             command.includes('notify-send');
      const isOurScript = command.includes('gemini-notify-hook.js');

      if (isDialog || isNotification || isOurScript) {
        return {
          enabled: true,
          type: isDialog ? 'dialog' : 'notification'
        };
      }
    }
  }

  return { enabled: false, type: 'notification' };
}

// 获取飞书配置
function getFeishuConfig() {
  const uiConfig = readUIConfig();
  return {
    enabled: uiConfig.feishuNotification?.enabled || false,
    webhookUrl: uiConfig.feishuNotification?.webhookUrl || ''
  };
}

// 保存飞书配置
function saveFeishuConfig(feishu) {
  const uiConfig = readUIConfig();
  uiConfig.feishuNotification = {
    enabled: feishu.enabled || false,
    webhookUrl: feishu.webhookUrl || ''
  };
  return writeUIConfig(uiConfig);
}

// 判断是否是 CCToolbox 自己的 hook 条目
function isCCToolboxEntry(entry) {
  // 支持嵌套格式: { hooks: [{ command }] } 和扁平格式: { command }
  const innerHooks = entry.hooks || [];
  if (innerHooks.length > 0) {
    return innerHooks.some((inner) => {
      const cmd = inner.command || '';
      return cmd.includes('gemini-notify-hook.js');
    });
  }
  const flatCmd = entry.command || '';
  return flatCmd.includes('gemini-notify-hook.js');
}

// 更新 AfterAgent hook 配置
function updateAfterAgentHook(systemNotification, feishu) {
  const settings = readGeminiSettings();

  const hasSystemNotification = systemNotification && systemNotification.enabled;
  const hasFeishu = feishu && feishu.enabled && feishu.webhookUrl;

  if (!hasSystemNotification && !hasFeishu) {
    // 禁用：只删除 CCToolbox 自己的条目，保留用户的其他 hooks
    if (settings.hooks && settings.hooks.AfterAgent && Array.isArray(settings.hooks.AfterAgent)) {
      settings.hooks.AfterAgent = settings.hooks.AfterAgent.filter(
        (entry) => !isCCToolboxEntry(entry)
      );
      if (settings.hooks.AfterAgent.length === 0) {
        delete settings.hooks.AfterAgent;
      }
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
    }

    const notifyPath = getNotifyScriptPath();
    if (fs.existsSync(notifyPath)) {
      fs.unlinkSync(notifyPath);
    }
  } else {
    writeNotifyScript({ systemNotification, feishu });

    settings.hooks = settings.hooks || {};
    if (!Array.isArray(settings.hooks.AfterAgent)) {
      settings.hooks.AfterAgent = [];
    }

    // 先移除已有的 CCToolbox 条目（避免重复）
    settings.hooks.AfterAgent = settings.hooks.AfterAgent.filter(
      (entry) => !isCCToolboxEntry(entry)
    );

    // 追加 CCToolbox 条目（正确的嵌套格式）
    settings.hooks.AfterAgent.push({
      hooks: [{
        type: 'command',
        command: `node "${getNotifyScriptPath()}"`
      }]
    });
  }

  return writeGeminiSettings(settings);
}

// 初始化默认 hooks 配置（服务启动时调用）
function initDefaultHooks() {
  try {
    const uiConfig = readUIConfig();

    if (uiConfig.geminiNotificationDisabledByUser === true) {
      console.log('[Gemini Hooks] 用户已主动关闭通知，跳过自动初始化');
      return;
    }

    if (uiConfig.geminiNotificationEnabledByUser !== true) {
      console.log('[Gemini Hooks] 未检测到用户启用记录，跳过自动初始化');
      return;
    }

    const settings = readGeminiSettings();
    const currentStatus = parseAfterAgentHookStatus(settings);

    if (currentStatus.enabled) {
      console.log('[Gemini Hooks] 已存在 AfterAgent hook 配置，跳过初始化');
      return;
    }

    const systemNotification = { enabled: true, type: 'notification' };
    const feishu = getFeishuConfig();

    if (updateAfterAgentHook(systemNotification, feishu)) {
      console.log('[Gemini Hooks] 已自动开启任务完成通知（右上角卡片）');
    }
  } catch (error) {
    console.error('[Gemini Hooks] 初始化默认配置失败:', error);
  }
}

// GET /api/gemini/hooks - 获取 hooks 配置状态
router.get('/', (req, res) => {
  try {
    const settings = readGeminiSettings();
    const afterAgentHook = parseAfterAgentHookStatus(settings);
    const feishu = getFeishuConfig();

    res.json({
      success: true,
      afterAgentHook,
      feishu,
      platform
    });
  } catch (error) {
    console.error('Error getting Gemini hooks:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/gemini/hooks - 保存 hooks 配置
router.post('/', (req, res) => {
  try {
    const { afterAgentHook, feishu } = req.body;

    if (feishu !== undefined) {
      saveFeishuConfig(feishu);
    }

    const systemNotification = afterAgentHook ? {
      enabled: afterAgentHook.enabled,
      type: afterAgentHook.type || 'notification'
    } : { enabled: false, type: 'notification' };

    const feishuConfig = feishu || getFeishuConfig();

    const uiConfig = readUIConfig();
    if (systemNotification.enabled || feishuConfig.enabled) {
      uiConfig.geminiNotificationEnabledByUser = true;
      if (uiConfig.geminiNotificationDisabledByUser) {
        delete uiConfig.geminiNotificationDisabledByUser;
      }
    } else {
      uiConfig.geminiNotificationDisabledByUser = true;
      if (uiConfig.geminiNotificationEnabledByUser) {
        delete uiConfig.geminiNotificationEnabledByUser;
      }
    }
    writeUIConfig(uiConfig);

    if (updateAfterAgentHook(systemNotification, feishuConfig)) {
      res.json({
        success: true,
        message: '配置已保存',
        afterAgentHook: systemNotification,
        feishu: feishuConfig
      });
    } else {
      res.status(500).json({ error: '保存配置失败' });
    }
  } catch (error) {
    console.error('Error saving Gemini hooks:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/gemini/hooks/test - 测试通知
router.post('/test', (req, res) => {
  try {
    const { type, testFeishu, webhookUrl } = req.body;

    if (testFeishu && webhookUrl) {
      const urlObj = new URL(webhookUrl);
      const data = JSON.stringify({
        msg_type: 'interactive',
        card: {
          header: {
            title: { tag: 'plain_text', content: '🧪 CCToolbox - 测试通知' },
            template: 'blue'
          },
          elements: [
            {
              tag: 'div',
              text: { tag: 'lark_md', content: '**状态**: 这是一条测试通知' }
            },
            {
              tag: 'div',
              text: { tag: 'lark_md', content: '**时间**: ' + new Date().toLocaleString('zh-CN') }
            },
            {
              tag: 'div',
              text: { tag: 'lark_md', content: '**设备**: ' + os.hostname() }
            }
          ]
        }
      });

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 10000
      };

      const reqModule = urlObj.protocol === 'https:' ? https : http;
      const request = reqModule.request(options, () => {
        res.json({ success: true, message: '飞书测试通知已发送' });
      });

      request.on('error', (e) => {
        res.status(500).json({ error: '飞书通知发送失败: ' + e.message });
      });

      request.write(data);
      request.end();
    } else {
      const command = generateSystemNotificationCommand(type || 'notification', 'Gemini CLI');
      const { execSync } = require('child_process');
      execSync(command, { stdio: 'ignore' });
      res.json({ success: true, message: '系统测试通知已发送' });
    }
  } catch (error) {
    console.error('Error testing Gemini notification:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.initDefaultHooks = initDefaultHooks;
