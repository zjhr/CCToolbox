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
  const originalUserProfile = process.env.USERPROFILE;
  const originalShell = process.env.SHELL;
  const originalPlatform = process.platform;

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
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

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
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

async function withTempHomeWindows(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-codex-settings-win-test-')
  );
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalShell = process.env.SHELL;
  const originalPlatform = process.platform;

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
  process.env.SHELL = 'powershell.exe';

  try {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32'
    });
    return await run(tempRoot);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
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
    let mockedUserShell = '/bin/zsh';

    childProcess.execFileSync = (file, args, options) => {
      if (file === '/usr/bin/dscl') {
        dsclCalls.push({ file, args, options });
        return `UserShell: ${mockedUserShell}\n`;
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

      // 场景1：同一文件中有重复 export 时，应只保留一条最新值
      fs.writeFileSync(
        shellConfigPath,
        [
          '# Added by CCToolbox for Codex [CODEXMANAGER_API_KEY]',
          'export CODEXMANAGER_API_KEY="legacy-1"',
          '',
          'export CODEXMANAGER_API_KEY="legacy-2"',
          ''
        ].join('\n'),
        'utf8'
      );

      const dedupeResult = injectEnvToShell(envName, 'latest-key');
      assert.strictEqual(dedupeResult.success, true);
      const dedupedContent = fs.readFileSync(shellConfigPath, 'utf8');
      const exportLines =
        dedupedContent.match(/^\s*export\s+CODEXMANAGER_API_KEY\s*=.*$/gm) || [];
      assert.strictEqual(exportLines.length, 1);
      assert.ok(exportLines[0].includes('"latest-key"'));

      // 场景2：登录 shell 变更后，若旧变量在 .zshrc，仍应更新旧文件
      mockedUserShell = '/bin/bash';
      const bashProfilePath = path.join(tempRoot, '.bash_profile');
      fs.writeFileSync(bashProfilePath, '# bash profile\n', 'utf8');
      fs.writeFileSync(
        shellConfigPath,
        '# Added by CCToolbox for Codex [CODEXMANAGER_API_KEY]\nexport CODEXMANAGER_API_KEY="from-zshrc-old"\n',
        'utf8'
      );

      const legacyPathResult = injectEnvToShell(envName, 'from-zshrc-new');
      assert.strictEqual(legacyPathResult.success, true);
      assert.strictEqual(legacyPathResult.path, shellConfigPath);
      const zshrcContent = fs.readFileSync(shellConfigPath, 'utf8');
      const bashProfileContent = fs.readFileSync(bashProfilePath, 'utf8');
      assert.ok(zshrcContent.includes('from-zshrc-new'));
      assert.ok(!bashProfileContent.includes(envName));
    } finally {
      childProcess.execFileSync = originalExecFileSync;
      delete process.env[envName];
    }
  });

  await withTempHomeWindows(async (tempRoot) => {
    const execCalls = [];
    const originalExecFileSync = childProcess.execFileSync;
    const envName = 'CODEXMANAGER_WIN_API_KEY';
    const envValue = `secret "double" and 'single'`;

    childProcess.execFileSync = (file, args, options) => {
      execCalls.push({ file, args, options });
      return Buffer.from('');
    };

    try {
      const {
        getShellConfigPath,
        injectEnvToShell,
        removeEnvFromShell
      } = loadCodexSettingsManager();

      const profilePath = getShellConfigPath();
      assert.strictEqual(
        profilePath,
        path.join(tempRoot, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
      );

      const injectResult = injectEnvToShell(envName, envValue);
      assert.strictEqual(injectResult.success, true);
      assert.strictEqual(process.env[envName], envValue);
      assert.strictEqual(injectResult.path, profilePath);
      assert.strictEqual(fs.existsSync(profilePath), true);

      const profileContent = fs.readFileSync(profilePath, 'utf8');
      assert.ok(profileContent.includes(`# Added by CCToolbox for Codex [${envName}]`));
      assert.ok(
        profileContent.includes(
          `$env:${envName} = 'secret "double" and ''single'''`
        )
      );

      assert.ok(execCalls.some(call =>
        call.file === 'setx' &&
        call.args[0] === envName &&
        call.args[1] === envValue
      ));

      const removeResult = removeEnvFromShell(envName);
      assert.strictEqual(removeResult.success, true);
      assert.strictEqual(process.env[envName], undefined);

      const cleanedProfileContent = fs.readFileSync(profilePath, 'utf8');
      assert.ok(!cleanedProfileContent.includes(envName));
      assert.ok(execCalls.some(call =>
        call.file === 'reg' &&
        call.args[0] === 'delete' &&
        call.args[1] === 'HKCU\\Environment' &&
        call.args[2] === '/F' &&
        call.args[3] === '/V' &&
        call.args[4] === envName
      ));
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
