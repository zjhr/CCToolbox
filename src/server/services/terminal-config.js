const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const { detectAvailableTerminals } = require('./terminal-detector');

/**
 * 获取当前选中的终端配置
 */
function resolveTerminal(terminalId) {
  const availableTerminals = detectAvailableTerminals();
  if (!availableTerminals.length) {
    return null;
  }

  if (terminalId) {
    const selectedTerminal = availableTerminals.find(t => t.id === terminalId);
    if (!selectedTerminal) {
      throw new Error(`Terminal not available: ${terminalId}`);
    }
    return selectedTerminal;
  }

  const defaultTerminal = availableTerminals.find(t => t.isDefault);
  return defaultTerminal || availableTerminals[0];
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

function escapeShellDoubleQuotes(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildClipboardCommand(cwd, cliCommand) {
  if (!cliCommand) {
    return null;
  }
  if (!cwd) {
    return cliCommand;
  }
  if (process.platform === 'win32') {
    const escapedCwd = String(cwd).replace(/"/g, '""');
    return `cd /d "${escapedCwd}" && ${cliCommand}`;
  }
  const escapedCwd = escapeShellDoubleQuotes(cwd);
  return `cd "${escapedCwd}" && ${cliCommand}`;
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
  const clipboardCmd = buildClipboardCommand(cwd, command);
  const escapedClipboardCmd = escapeShellDoubleQuotes(clipboardCmd);

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
      fallback: null,
      clipboardCommand: clipboardCmd
    };
  } catch (err) {
    console.warn('[Terminal] Failed to create Warp config, using fallback:', err);
    return {
      command: `printf '%s' "${escapedClipboardCmd}" | pbcopy && open -a Warp "${cwd}"`,
      terminalId: 'warp',
      terminalName: 'Warp',
      fallback: 'clipboard',
      clipboardCommand: clipboardCmd
    };
  }
}

/**
 * 获取终端启动命令（填充参数后）
 * @param {string} cwd - 工作目录
 * @param {string} sessionId - 会话ID（用于 Claude -r 参数）
 * @param {string} customCliCommand - 自定义 CLI 命令（如 "gemini --resume latest"），如果提供则替换默认的 claude 命令
 */
function getTerminalLaunchCommand(cwd, sessionId, customCliCommand, terminalId = null) {
  const terminal = resolveTerminal(terminalId);
  const cliCommand = customCliCommand || (sessionId ? `claude -r ${sessionId}` : null);
  const clipboardCommand = buildClipboardCommand(cwd, cliCommand);

  if (!terminal) {
    throw new Error('No terminal available');
  }

  if (terminal.id === 'warp') {
    return {
      ...createWarpLaunchConfig(cwd, sessionId, cliCommand)
    };
  }

  if (terminal.id === 'vscode') {
    if (!cliCommand) {
      throw new Error('无法生成 VSCode 启动命令');
    }

    const escapedClipboardCommand = escapeShellSingleQuotes(cliCommand);
    const escapedCwd = escapeShellSingleQuotes(cwd);
    const appName = terminal.appName || 'Visual Studio Code';
    const openCommand = terminal.hasCli && !terminal.appName
      ? `code -r '${escapedCwd}'`
      : `open -a "${escapeShellDoubleQuotes(appName)}" '${escapedCwd}'`;
    const command = `printf '%s' '${escapedClipboardCommand}' | pbcopy; ${openCommand}`;

    return {
      command,
      terminalId: terminal.id,
      terminalName: terminal.name,
      clipboardCommand
    };
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
    terminalName: terminal.name,
    clipboardCommand
  };
}

module.exports = {
  getTerminalLaunchCommand
};
