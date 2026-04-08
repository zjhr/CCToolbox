const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-codex-channels-test-')
  );
  const originalHome = process.env.HOME;
  const originalCctoolboxHome = process.env.CCTOOLBOX_HOME;

  process.env.HOME = tempRoot;
  process.env.CCTOOLBOX_HOME = tempRoot;

  try {
    return await run(tempRoot);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalCctoolboxHome === undefined) {
      delete process.env.CCTOOLBOX_HOME;
    } else {
      process.env.CCTOOLBOX_HOME = originalCctoolboxHome;
    }

    removeDir(tempRoot);
  }
}

function loadCodexChannelsService() {
  delete require.cache[require.resolve('../src/server/services/codex-channels')];
  delete require.cache[require.resolve('../src/server/services/codex-config')];
  delete require.cache[require.resolve('../src/server/services/codex-settings-manager')];
  delete require.cache[require.resolve('../src/utils/app-path-manager')];
  return require('../src/server/services/codex-channels');
}

async function runTestCase(name, run, failures) {
  try {
    await run();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

async function runCodexChannelTests() {
  const failures = [];

  await runTestCase(
    'createChannel should use gpt-5.4 as default model name',
    async () => {
      await withTempHome(async () => {
        const { createChannel } = loadCodexChannelsService();

        const channel = createChannel(
          'Default Model Channel',
          'provider-default-model',
          'https://example.com/v1',
          ''
        );

        assert.strictEqual(channel.modelName, 'gpt-5.4');
      });
    },
    failures
  );

  await runTestCase(
    'createChannel should use custom model name when provided',
    async () => {
      await withTempHome(async () => {
        const { createChannel } = loadCodexChannelsService();

        const channel = createChannel(
          'Custom Model Channel',
          'provider-custom-model',
          'https://example.com/v1',
          '',
          'responses',
          { modelName: 'gpt-4o-mini' }
        );

        assert.strictEqual(channel.modelName, 'gpt-4o-mini');
      });
    },
    failures
  );

  await runTestCase(
    'applyChannelToSettings should sync OPENAI_API_KEY in auth.json',
    async () => {
      await withTempHome(async (tempRoot) => {
        const originalExecFileSync = childProcess.execFileSync;
        childProcess.execFileSync = (file) => {
          if (file === '/usr/bin/dscl') {
            return 'UserShell: /bin/zsh\n';
          }
          return Buffer.from('');
        };

        try {
          const { createChannel, applyChannelToSettings } = loadCodexChannelsService();

          const channel = createChannel(
            'Auth Sync Channel',
            'provider-auth-sync',
            'https://example.com/v1',
            'sk-auth-sync-test'
          );

          applyChannelToSettings(channel.id);

          const authPath = path.join(tempRoot, '.codex', 'auth.json');
          const configPath = path.join(tempRoot, '.codex', 'config.toml');
          const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
          const configContent = fs.readFileSync(configPath, 'utf8');

          assert.strictEqual(auth[channel.envKey], 'sk-auth-sync-test');
          assert.strictEqual(auth.OPENAI_API_KEY, 'sk-auth-sync-test');
          assert.ok(configContent.includes('model = "gpt-5.4"'));
        } finally {
          childProcess.execFileSync = originalExecFileSync;
        }
      });
    },
    failures
  );

  await runTestCase(
    'writeCodexConfigForMultiChannel should sync env to shell and launchd for daemon inheritance',
    async () => {
      await withTempHome(async (tempRoot) => {
        const originalExecFileSync = childProcess.execFileSync;
        const originalPlatform = process.platform;
        const launchctlCalls = [];

        Object.defineProperty(process, 'platform', {
          configurable: true,
          value: 'darwin'
        });

        childProcess.execFileSync = (file, args) => {
          if (file === '/usr/bin/dscl') {
            return 'UserShell: /bin/zsh\n';
          }
          if (file === '/bin/launchctl') {
            launchctlCalls.push(args);
            return Buffer.from('');
          }
          return Buffer.from('');
        };

        try {
          const { writeCodexConfigForMultiChannel } = loadCodexChannelsService();

          writeCodexConfigForMultiChannel([
            {
              providerKey: 'daemon',
              name: 'Daemon Channel',
              baseUrl: 'https://example.com/v1',
              wireApi: 'responses',
              requiresOpenaiAuth: true,
              queryParams: null,
              apiKey: 'sk-daemon-test',
              enabled: true
            }
          ]);

          const shellPath = path.join(tempRoot, '.zshrc');
          const shellContent = fs.readFileSync(shellPath, 'utf8');

          assert.ok(shellContent.includes('export DAEMON_API_KEY="sk-daemon-test"'));
          assert.ok(
            launchctlCalls.some((args) =>
              args[0] === 'setenv' &&
              args[1] === 'DAEMON_API_KEY' &&
              args[2] === 'sk-daemon-test'
            )
          );
        } finally {
          childProcess.execFileSync = originalExecFileSync;
          Object.defineProperty(process, 'platform', {
            configurable: true,
            value: originalPlatform
          });
        }
      });
    },
    failures
  );

  if (failures.length > 0) {
    const summary = failures
      .map((item, index) => `${index + 1}. ${item.name}: ${item.error.message}`)
      .join('\n');
    throw new Error(`Codex channels tests failed:\n${summary}`);
  }

  console.log('Codex channels tests passed');
}

runCodexChannelTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
