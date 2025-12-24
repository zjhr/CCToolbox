const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const { detectAvailableTerminals, getDefaultTerminal } = require('./terminal-detector');

/**
 * 获取配置文件路径
 */
function getConfigFilePath() {
  const ccToolDir = path.join(os.homedir(), '.claude', 'cc-tool');
  if (!fs.existsSync(ccToolDir)) {
    fs.mkdirSync(ccToolDir, { recursive: true });
  }
  return path.join(ccToolDir, 'terminal-config.json');
}

/**
 * 加载终端配置
 */
function loadTerminalConfig() {
  const configPath = getConfigFilePath();

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load terminal config:', err);
  }

  // 返回默认配置
  const defaultTerminal = getDefaultTerminal();
  return {
    selectedTerminal: defaultTerminal ? defaultTerminal.id : null,
    customCommand: null
  };
}

/**
 * 保存终端配置
 */
function saveTerminalConfig(config) {
  const configPath = getConfigFilePath();

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Failed to save terminal config:', err);
    throw new Error('Failed to save terminal config: ' + err.message);
  }
}

/**
 * 获取当前选中的终端配置
 */
function getSelectedTerminal() {
  const config = loadTerminalConfig();
  const availableTerminals = detectAvailableTerminals();

  // 如果配置了自定义命令，返回自定义配置
  if (config.customCommand) {
    return {
      id: 'custom',
      name: 'Custom',
      available: true,
      isDefault: false,
      command: config.customCommand
    };
  }

  // 查找选中的终端
  const selectedTerminal = availableTerminals.find(t => t.id === config.selectedTerminal);

  // 如果找到则返回，否则返回默认终端
  return selectedTerminal || getDefaultTerminal();
}

function escapeWarpYamlValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeAppleScriptString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeShellSingleQuotes(value) {
  return String(value).replace(/'/g, `'\"'\"'`);
}

function createWarpLaunchConfig(cwd, sessionId, customCliCommand) {
  const warpConfigDir = path.join(os.homedir(), '.warp', 'launch_configurations');

  if (!fs.existsSync(warpConfigDir)) {
    fs.mkdirSync(warpConfigDir, { recursive: true });
  }

  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const configName = `warp-cctools-${timestamp}-${random}`;
  const filename = `${configName}.yaml`;
  const configPath = path.join(warpConfigDir, filename);
  const command = customCliCommand || `claude -r ${sessionId}`;
  const sessionLabel = sessionId || 'custom';
  const tabTitle = sessionId ? `Session ${sessionId}` : 'Session';
  const clipboardCmd = `cd "${cwd}" && ${command}`;
  const escapedClipboardCmd = clipboardCmd.replace(/"/g, '\\"');

  const yamlContent = `---
name: "${escapeWarpYamlValue(configName)}"
windows:
  - tabs:
      - title: "${escapeWarpYamlValue(tabTitle)}"
        layout:
          cwd: "${escapeWarpYamlValue(cwd)}"
          commands:
            - exec: "${escapeWarpYamlValue(command)}"
`;

  try {
    fs.writeFileSync(configPath, yamlContent, 'utf8');

    // 5 秒后清理临时配置文件
    setTimeout(() => {
      try {
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      } catch (err) {
        console.error('[Terminal] Failed to cleanup Warp config:', err);
      }
    }, 5000);

    const scriptLines = [
      'tell application "Warp" to activate',
      'delay 0.4',
      'tell application "System Events" to tell process "Warp" to keystroke "t" using {command down}',
      'delay 0.2',
      'tell application "System Events" to tell process "Warp" to keystroke "v" using {command down}',
      'delay 0.8',
      'tell application "System Events" to tell process "Warp" to keystroke return'
    ];
    const osascriptCommand = `osascript ${scriptLines
      .map(line => `-e '${escapeShellSingleQuotes(line)}'`)
      .join(' ')}`;

    return {
      // 优先在已打开的 Warp 窗口中新开标签页
      command: `printf '%s' "${escapedClipboardCmd}" | pbcopy && ${osascriptCommand} || open "warp://launch/${configName}"`,
      terminalId: 'warp',
      terminalName: 'Warp',
      fallback: null
    };
  } catch (err) {
    console.warn('[Terminal] Failed to create Warp config, using fallback:', err);
    return {
      command: `printf '%s' "${escapedClipboardCmd}" | pbcopy && open -a Warp "${cwd}"`,
      terminalId: 'warp',
      terminalName: 'Warp',
      fallback: 'clipboard'
    };
  }
}

/**
 * 获取终端启动命令（填充参数后）
 * @param {string} cwd - 工作目录
 * @param {string} sessionId - 会话ID（用于 Claude -r 参数）
 * @param {string} customCliCommand - 自定义 CLI 命令（如 "gemini --resume latest"），如果提供则替换默认的 claude 命令
 */
function getTerminalLaunchCommand(cwd, sessionId, customCliCommand) {
  const terminal = getSelectedTerminal();

  if (!terminal) {
    throw new Error('No terminal available');
  }

  if (terminal.id === 'warp') {
    return createWarpLaunchConfig(cwd, sessionId, customCliCommand);
  }

  let command = terminal.command;

  // 如果提供了自定义 CLI 命令，替换模板中的 claude 命令部分
  if (customCliCommand) {
    // 替换各种格式的 claude 命令
    command = command
      .replace(/claude\s+-r\s+\{sessionId\}/g, customCliCommand)
      .replace(/claude\s+-r\s+{sessionId}/g, customCliCommand);
  } else {
    // 默认行为：替换 sessionId 占位符
    command = command.replace(/{sessionId}/g, sessionId);
  }

  // 替换 cwd 占位符
  command = command.replace(/{cwd}/g, cwd);

  return {
    command,
    terminalId: terminal.id,
    terminalName: terminal.name
  };
}

module.exports = {
  loadTerminalConfig,
  saveTerminalConfig,
  getSelectedTerminal,
  getTerminalLaunchCommand
};
