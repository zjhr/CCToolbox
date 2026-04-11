const assert = require('assert');

function setPlatform(value) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value
  });
}

function withMockedTerminals(terminals, run) {
  const detectorPath = require.resolve('../src/server/services/terminal-detector');
  const terminalConfigPath = require.resolve('../src/server/services/terminal-config');
  const originalDetector = require.cache[detectorPath];
  const originalTerminalConfig = require.cache[terminalConfigPath];

  require.cache[detectorPath] = {
    id: detectorPath,
    filename: detectorPath,
    loaded: true,
    exports: {
      detectAvailableTerminals() {
        return terminals;
      }
    }
  };
  delete require.cache[terminalConfigPath];

  const terminalConfig = require('../src/server/services/terminal-config');

  try {
    run(terminalConfig);
  } finally {
    if (originalDetector) {
      require.cache[detectorPath] = originalDetector;
    } else {
      delete require.cache[detectorPath];
    }

    if (originalTerminalConfig) {
      require.cache[terminalConfigPath] = originalTerminalConfig;
    } else {
      delete require.cache[terminalConfigPath];
    }
  }
}

function runTerminalConfigTests() {
  const originalPlatform = process.platform;

  try {
    setPlatform('win32');

    withMockedTerminals([
      { id: 'cmd', name: 'CMD', isDefault: true, command: '__UNUSED__' }
    ], ({ getTerminalLaunchCommand }) => {
      const cwd = 'C:\\Work (Alpha)\\My & Project';
      const result = getTerminalLaunchCommand(cwd, 'session-123', null, 'cmd');

      assert.strictEqual(result.terminalId, 'cmd');
      assert.ok(result.command.includes('cd /d ""C:\\Work (Alpha)\\My & Project""'));
      assert.ok(result.command.includes('claude -r session-123'));
      assert.strictEqual(
        result.clipboardCommand,
        'cd /d "C:\\Work (Alpha)\\My & Project" && claude -r session-123'
      );
    });

    withMockedTerminals([
      { id: 'powershell', name: 'PowerShell', isDefault: true, command: '__UNUSED__' }
    ], ({ getTerminalLaunchCommand }) => {
      const cwd = `C:\\Users\\O'Neil\\Repo`;
      const result = getTerminalLaunchCommand(cwd, 'session-456', null, 'powershell');

      assert.strictEqual(result.terminalId, 'powershell');
      assert.ok(result.command.includes(`Set-Location -LiteralPath 'C:\\Users\\O''Neil\\Repo'`));
      assert.ok(result.command.includes('claude -r session-456'));
    });

    withMockedTerminals([
      { id: 'windows-terminal', name: 'Windows Terminal', isDefault: true, command: '__UNUSED__' }
    ], ({ getTerminalLaunchCommand }) => {
      const cwd = 'C:\\Work\\Project';
      const result = getTerminalLaunchCommand(
        cwd,
        'session-789',
        'codex resume "latest"',
        'windows-terminal'
      );

      assert.strictEqual(result.terminalId, 'windows-terminal');
      assert.ok(result.command.includes('wt.exe -d "C:\\Work\\Project"'));
      assert.ok(result.command.includes('cmd /k "codex resume \\"latest\\""'));
    });

    withMockedTerminals([
      {
        id: 'git-bash',
        name: 'Git Bash',
        isDefault: true,
        command: '__UNUSED__',
        executablePath: 'C:\\Program Files\\Git\\bin\\bash.exe'
      }
    ], ({ getTerminalLaunchCommand }) => {
      const cwd = `C:\\Users\\O'Neil\\Repo`;
      const result = getTerminalLaunchCommand(cwd, 'session-999', null, 'git-bash');

      assert.strictEqual(result.terminalId, 'git-bash');
      assert.ok(result.command.includes('"C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe"'));
      assert.ok(result.command.includes(`cd 'C:\\Users\\O'"'"'Neil\\Repo'`));
      assert.ok(result.command.includes('exec bash'));
    });
  } finally {
    setPlatform(originalPlatform);
  }

  console.log('terminal-config tests passed');
}

runTerminalConfigTests();
