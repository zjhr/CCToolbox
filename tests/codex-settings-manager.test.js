const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-codex-settings-test-')
  );
  const originalHome = process.env.HOME;
  const originalShell = process.env.SHELL;
  const originalPlatform = process.platform;

  process.env.HOME = tempRoot;
  process.env.SHELL = '/bin/bash';

  try {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'darwin'
    });
    return await run(tempRoot);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }

    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: originalPlatform
    });

    removeDir(tempRoot);
  }
}

function loadCodexSettingsManager() {
  delete require.cache[require.resolve('../src/server/services/codex-settings-manager')];
  delete require.cache[require.resolve('../src/utils/app-path-manager')];
  return require('../src/server/services/codex-settings-manager');
}

async function runCodexSettingsManagerTests() {
  await withTempHome(async (tempRoot) => {
    const dsclCalls = [];
    const launchctlCalls = [];
    const originalExecFileSync = childProcess.execFileSync;
    const envName = 'CODEXMANAGER_API_KEY';
    const envValue = 'secret-"key"$dollar`tick`\\value';

    childProcess.execFileSync = (file, args, options) => {
      if (file === '/usr/bin/dscl') {
        dsclCalls.push({ file, args, options });
        return 'UserShell: /bin/zsh\n';
      }
      launchctlCalls.push({ file, args, options });
      return Buffer.from('');
    };

    try {
      const {
        getShellConfigPath,
        injectEnvToShell,
        removeEnvFromShell
      } = loadCodexSettingsManager();

      const injectResult = injectEnvToShell(envName, envValue);
      assert.strictEqual(injectResult.success, true);
      assert.strictEqual(process.env[envName], envValue);

      const shellConfigPath = getShellConfigPath();
      assert.strictEqual(
        shellConfigPath,
        path.join(tempRoot, '.zshrc')
      );
      assert.ok(!fs.existsSync(path.join(tempRoot, '.bash_profile')));

      const shellContent = fs.readFileSync(shellConfigPath, 'utf8');
      assert.ok(shellContent.includes(`# Added by CCToolbox for Codex [${envName}]`));
      assert.ok(
        shellContent.includes(
          'export CODEXMANAGER_API_KEY="secret-\\"key\\"\\$dollar\\`tick\\`\\\\value"'
        )
      );

      assert.deepStrictEqual(launchctlCalls[0], {
        file: '/bin/launchctl',
        args: ['setenv', envName, envValue],
        options: { stdio: 'ignore' }
      });
      assert.deepStrictEqual(dsclCalls[0], {
        file: '/usr/bin/dscl',
        args: ['.', '-read', `/Users/${os.userInfo().username}`, 'UserShell'],
        options: { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      });

      const removeResult = removeEnvFromShell(envName);
      assert.strictEqual(removeResult.success, true);
      assert.strictEqual(process.env[envName], undefined);

      const cleanedShellContent = fs.readFileSync(shellConfigPath, 'utf8');
      assert.ok(!cleanedShellContent.includes(envName));

      assert.deepStrictEqual(launchctlCalls[1], {
        file: '/bin/launchctl',
        args: ['unsetenv', envName],
        options: { stdio: 'ignore' }
      });
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      delete process.env[envName];
    }
  });

  console.log('Codex settings manager tests passed');
}

runCodexSettingsManagerTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
