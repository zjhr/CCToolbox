const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const CODEX_HOOKS_PATH = path.join(os.homedir(), '.codex', 'hooks.json');

const { getAppDir } = require('../../utils/app-path-manager');
const {
  getFeishuConfig,
  saveFeishuConfig,
  readUIConfig,
  writeUIConfig
} = require('../services/feishu-config');

const platform = os.platform(); // 'darwin' | 'win32' | 'linux'

function getNotifyScriptPath() {
  return path.join(getAppDir(), 'codex-notify-hook.js');
}

function readCodexHooks() {
  try {
    if (fs.existsSync(CODEX_HOOKS_PATH)) {
      const content = fs.readFileSync(CODEX_HOOKS_PATH, 'utf8');
      return JSON.parse(content);
    }
    return {};
  } catch (error) {
    console.error('Failed to read Codex hooks:', error);
    return {};
  }
}

function writeCodexHooks(config) {
  try {
    const dir = path.dirname(CODEX_HOOKS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CODEX_HOOKS_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write Codex hooks:', error);
    return false;
  }
}

function generateSystemNotificationCommand(type) {
  const notifyMessage = 'Codex CLI 任务已完成 | 等待交互';

  if (platform === 'darwin') {
    if (type === 'dialog') {
      return `osascript -e 'display dialog "${notifyMessage}" with title "CCToolbox" buttons {"好的"} default button 1 with icon note'`;
    }
    return `if command -v terminal-notifier &>/dev/null; then terminal-notifier -title "CCToolbox" -message "${notifyMessage}" -sound Glass -activate com.apple.Terminal; else osascript -e 'display notification "${notifyMessage}" with title "CCToolbox" sound name "Glass"'; fi`;
  }

  if (platform === 'win32') {
    if (type === 'dialog') {
      return `powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${notifyMessage}', 'CCToolbox', 'OK', 'Information')"`;
    }
    return `powershell -Command "$wshell = New-Object -ComObject Wscript.Shell; $wshell.Popup('${notifyMessage}', 5, 'CCToolbox', 0x40)"`;
  }

  if (type === 'dialog') {
    return `zenity --info --title="CCToolbox" --text="${notifyMessage}" 2>/dev/null || notify-send "CCToolbox" "${notifyMessage}"`;
  }
  return `notify-send "CCToolbox" "${notifyMessage}"`;
}

function generateNotifyScript(config) {
  const { systemNotification, feishu } = config;

  let script = `#!/usr/bin/env node
// CCToolbox Codex 通知脚本 - 自动生成，请勿手动修改
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const os = require('os');

const timestamp = new Date().toLocaleString('zh-CN');

`;

  if (systemNotification && systemNotification.enabled) {
    const cmd = generateSystemNotificationCommand(systemNotification.type);
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
      title: { tag: 'plain_text', content: '🎉 CCToolbox - Codex CLI 任务完成' },
      template: 'green'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: '**状态**: Codex CLI 任务已完成 | 等待交互' }
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

function writeNotifyScript(config) {
  try {
    const notifyPath = getNotifyScriptPath();
    const dir = path.dirname(notifyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const script = generateNotifyScript(config);
    fs.writeFileSync(notifyPath, script, { mode: 0o755 });
    return true;
  } catch (error) {
    console.error('Failed to write Codex notify script:', error);
    return false;
  }
}

function parseStopHookStatus(config) {
  const hooks = config.hooks;
  if (!hooks || !hooks.Stop || !Array.isArray(hooks.Stop) || hooks.Stop.length === 0) {
    return { enabled: false, type: 'notification' };
  }

  // Codex hooks 是嵌套结构: Stop[i].hooks[j].command
  for (const entry of hooks.Stop) {
    const innerHooks = entry.hooks || [];
    for (const inner of innerHooks) {
      const command = inner.command || '';

      const isDialog = command.includes('display dialog') ||
                       command.includes('MessageBox') ||
                       command.includes('zenity --info');
      const isNotification = command.includes('display notification') ||
                             command.includes('Popup') ||
                             command.includes('notify-send');
      const isOurScript = command.includes('codex-notify-hook.js');

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

// 判断是否是 CCToolbox 自己的 hook 条目
function isCCToolboxEntry(entry) {
  const innerHooks = entry.hooks || [];
  return innerHooks.some((inner) => {
    const cmd = inner.command || '';
    return cmd.includes('codex-notify-hook.js');
  });
}

function updateStopHook(systemNotification, feishu) {
  const hooksConfig = readCodexHooks();

  const hasSystemNotification = systemNotification && systemNotification.enabled;
  const hasFeishu = feishu && feishu.enabled && feishu.webhookUrl;

  if (!hasSystemNotification && !hasFeishu) {
    // 禁用：只删除 CCToolbox 自己的条目，保留用户的其他 hooks
    if (hooksConfig.hooks && hooksConfig.hooks.Stop && Array.isArray(hooksConfig.hooks.Stop)) {
      hooksConfig.hooks.Stop = hooksConfig.hooks.Stop.filter((entry) => !isCCToolboxEntry(entry));
      if (hooksConfig.hooks.Stop.length === 0) {
        delete hooksConfig.hooks.Stop;
      }
      if (Object.keys(hooksConfig.hooks).length === 0) {
        delete hooksConfig.hooks;
      }
    }

    const notifyPath = getNotifyScriptPath();
    if (fs.existsSync(notifyPath)) {
      fs.unlinkSync(notifyPath);
    }
  } else {
    writeNotifyScript({ systemNotification, feishu });

    hooksConfig.hooks = hooksConfig.hooks || {};
    if (!Array.isArray(hooksConfig.hooks.Stop)) {
      hooksConfig.hooks.Stop = [];
    }

    // 先移除已有的 CCToolbox 条目（避免重复）
    hooksConfig.hooks.Stop = hooksConfig.hooks.Stop.filter((entry) => !isCCToolboxEntry(entry));

    // 追加 CCToolbox 条目（正确的嵌套格式）
    hooksConfig.hooks.Stop.push({
      hooks: [{
        type: 'command',
        command: `node "${getNotifyScriptPath()}"`
      }]
    });
  }

  return writeCodexHooks(hooksConfig);
}

function initDefaultHooks() {
  try {
    const uiConfig = readUIConfig();

    if (uiConfig.codexNotificationDisabledByUser === true) {
      console.log('[Codex Hooks] 用户已主动关闭通知，跳过自动初始化');
      return;
    }

    if (uiConfig.codexNotificationEnabledByUser !== true) {
      console.log('[Codex Hooks] 未检测到用户启用记录，跳过自动初始化');
      return;
    }

    const hooksConfig = readCodexHooks();
    const currentStatus = parseStopHookStatus(hooksConfig);

    if (currentStatus.enabled) {
      console.log('[Codex Hooks] 已存在 Stop hook 配置，跳过初始化');
      return;
    }

    const systemNotification = { enabled: true, type: 'notification' };
    const feishu = getFeishuConfig();

    if (updateStopHook(systemNotification, feishu)) {
      console.log('[Codex Hooks] 已自动开启任务完成通知（右上角卡片）');
    }
  } catch (error) {
    console.error('[Codex Hooks] 初始化默认配置失败:', error);
  }
}

router.get('/', (req, res) => {
  try {
    const hooksConfig = readCodexHooks();
    const stopHook = parseStopHookStatus(hooksConfig);
    const feishu = getFeishuConfig();

    res.json({
      success: true,
      stopHook,
      feishu,
      platform
    });
  } catch (error) {
    console.error('Error getting Codex hooks:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { stopHook, feishu } = req.body;

    if (feishu !== undefined) {
      saveFeishuConfig(feishu);
    }

    const systemNotification = stopHook ? {
      enabled: stopHook.enabled,
      type: stopHook.type || 'notification'
    } : { enabled: false, type: 'notification' };

    const feishuConfig = feishu || getFeishuConfig();

    const uiConfig = readUIConfig();
    if (systemNotification.enabled || feishuConfig.enabled) {
      uiConfig.codexNotificationEnabledByUser = true;
      if (uiConfig.codexNotificationDisabledByUser) {
        delete uiConfig.codexNotificationDisabledByUser;
      }
    } else {
      uiConfig.codexNotificationDisabledByUser = true;
      if (uiConfig.codexNotificationEnabledByUser) {
        delete uiConfig.codexNotificationEnabledByUser;
      }
    }
    writeUIConfig(uiConfig);

    if (updateStopHook(systemNotification, feishuConfig)) {
      res.json({
        success: true,
        message: '配置已保存',
        stopHook: systemNotification,
        feishu: feishuConfig
      });
    } else {
      res.status(500).json({ error: '保存配置失败' });
    }
  } catch (error) {
    console.error('Error saving Codex hooks:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/test', (req, res) => {
  try {
    const { type, testFeishu, webhookUrl } = req.body;

    if (testFeishu && webhookUrl) {
      const urlObj = new URL(webhookUrl);
      const data = JSON.stringify({
        msg_type: 'interactive',
        card: {
          header: {
            title: { tag: 'plain_text', content: '🧪 CCToolbox - Codex CLI 测试通知' },
            template: 'blue'
          },
          elements: [
            {
              tag: 'div',
              text: { tag: 'lark_md', content: '**状态**: 这是一条 Codex CLI 测试通知' }
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
      const command = generateSystemNotificationCommand(type || 'notification');
      const { execSync } = require('child_process');
      execSync(command, { stdio: 'ignore' });
      res.json({ success: true, message: '系统测试通知已发送' });
    }
  } catch (error) {
    console.error('Error testing Codex notification:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.initDefaultHooks = initDefaultHooks;
