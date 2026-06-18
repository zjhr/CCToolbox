const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function clearModuleCache() {
  [
    '../src/commands/channel',
    'inquirer',
    '../src/config/loader',
    '../src/server/services/channels',
    '../src/server/services/codex-channels',
    '../src/server/services/codex-config',
    '../src/server/services/codex-settings-manager',
    '../src/server/services/gemini-channels',
    '../src/server/services/gemini-config',
    '../src/server/services/channel-scheduler',
    '../src/server/websocket-server',
    '../src/utils/app-path-manager'
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (error) {
      // ignore
    }
  });
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-channel-cli-test-')
  );
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalCctoolboxHome = process.env.CCTOOLBOX_HOME;
  const originalDisableEnvAutosync = process.env.CCTOOLBOX_DISABLE_ENV_AUTOSYNC;

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
  process.env.CCTOOLBOX_HOME = tempRoot;
  process.env.CCTOOLBOX_DISABLE_ENV_AUTOSYNC = '1';

  try {
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

    if (originalCctoolboxHome === undefined) {
      delete process.env.CCTOOLBOX_HOME;
    } else {
      process.env.CCTOOLBOX_HOME = originalCctoolboxHome;
    }

    if (originalDisableEnvAutosync === undefined) {
      delete process.env.CCTOOLBOX_DISABLE_ENV_AUTOSYNC;
    } else {
      process.env.CCTOOLBOX_DISABLE_ENV_AUTOSYNC = originalDisableEnvAutosync;
    }

    clearModuleCache();
    removeDir(tempRoot);
  }
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

async function runChannelCliCommandTests() {
  const failures = [];

  await runTestCase(
    'ct channel switch should prompt CLI type before prompting channel',
    async () => {
      await withTempHome(async (tempRoot) => {
        clearModuleCache();

        const service = require('../src/server/services/gemini-channels');
        const inquirer = require('inquirer');
        const originalPrompt = inquirer.prompt;

        try {
          const first = service.createChannel(
            'Gemini Type First',
            'https://type-first.gemini.example.com',
            'gemini-type-first-key',
            'gemini-2.5-pro'
          );
          const second = service.createChannel(
            'Gemini Type Second',
            'https://type-second.gemini.example.com',
            'gemini-type-second-key',
            'gemini-2.5-flash'
          );

          const promptNames = [];
          inquirer.prompt = async (questions) => {
            promptNames.push(questions[0].name);
            if (questions[0].name === 'cliType') {
              return { cliType: 'gemini' };
            }
            if (questions[0].name === 'channelId') {
              return { channelId: second.id };
            }
            throw new Error(`Unexpected prompt: ${questions[0].name}`);
          };

          const { handleChannelCommand } = require('../src/commands/channel');
          await handleChannelCommand(['switch']);

          const channels = service.getChannels().channels;
          const savedFirst = channels.find((channel) => channel.id === first.id);
          const savedSecond = channels.find((channel) => channel.id === second.id);
          const envPath = path.join(tempRoot, '.gemini', '.env');
          const envContent = fs.readFileSync(envPath, 'utf8');

          assert.deepStrictEqual(promptNames, ['cliType', 'channelId']);
          assert.strictEqual(savedFirst.enabled, false);
          assert.strictEqual(savedSecond.enabled, true);
          assert.ok(envContent.includes('GOOGLE_GEMINI_BASE_URL=https://type-second.gemini.example.com'));
          assert.ok(envContent.includes('GEMINI_API_KEY=gemini-type-second-key'));
          assert.ok(envContent.includes('GEMINI_MODEL=gemini-2.5-flash'));
        } finally {
          inquirer.prompt = originalPrompt;
        }
      });
    },
    failures
  );

  await runTestCase(
    'ct channel switch claude should prompt and switch selected channel',
    async () => {
      await withTempHome(async (tempRoot) => {
        clearModuleCache();
        ensureDir(path.join(tempRoot, '.claude'));

        const service = require('../src/server/services/channels');
        const inquirer = require('inquirer');
        const originalPrompt = inquirer.prompt;
        const originalNow = Date.now;
        let now = 1000;

        try {
          Date.now = () => {
            now += 1;
            return now;
          };
          const first = service.createChannel(
            'Claude Prompt First',
            'https://prompt-first.example.com',
            'sk-prompt-first'
          );
          const second = service.createChannel(
            'Claude Prompt Second',
            'https://prompt-second.example.com',
            'sk-prompt-second'
          );
          inquirer.prompt = async (questions) => {
            assert.strictEqual(questions[0].type, 'list');
            assert.strictEqual(questions[0].name, 'channelId');
            return { channelId: second.id };
          };

          const { handleChannelCommand } = require('../src/commands/channel');
          await handleChannelCommand(['switch', 'claude']);

          const channels = service.getAllChannels();
          const savedFirst = channels.find((channel) => channel.id === first.id);
          const savedSecond = channels.find((channel) => channel.id === second.id);
          const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

          assert.strictEqual(savedFirst.enabled, false);
          assert.strictEqual(savedSecond.enabled, true);
          assert.strictEqual(settings.env.ANTHROPIC_BASE_URL, 'https://prompt-second.example.com');
          assert.strictEqual(settings.env.ANTHROPIC_AUTH_TOKEN, 'sk-prompt-second');
        } finally {
          inquirer.prompt = originalPrompt;
          Date.now = originalNow;
        }
      });
    },
    failures
  );

  await runTestCase(
    'ct channel switch claude <id> should write settings and only enable target channel',
    async () => {
      await withTempHome(async (tempRoot) => {
        clearModuleCache();
        ensureDir(path.join(tempRoot, '.claude'));

        const service = require('../src/server/services/channels');
        const { handleChannelCommand } = require('../src/commands/channel');
        const originalNow = Date.now;
        let now = 2000;

        let first;
        let second;
        try {
          Date.now = () => {
            now += 1;
            return now;
          };
          first = service.createChannel(
            'Claude First',
            'https://first.example.com',
            'sk-first'
          );
          second = service.createChannel(
            'Claude Second',
            'https://second.example.com',
            'sk-second'
          );
        } finally {
          Date.now = originalNow;
        }

        await handleChannelCommand(['switch', 'claude', second.id]);

        const channels = service.getAllChannels();
        const savedFirst = channels.find((channel) => channel.id === first.id);
        const savedSecond = channels.find((channel) => channel.id === second.id);
        const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

        assert.strictEqual(savedFirst.enabled, false);
        assert.strictEqual(savedSecond.enabled, true);
        assert.strictEqual(settings.env.ANTHROPIC_BASE_URL, 'https://second.example.com');
        assert.strictEqual(settings.env.ANTHROPIC_AUTH_TOKEN, 'sk-second');
      });
    },
    failures
  );

  await runTestCase(
    'ct channel switch gemini <name> should write .env and only enable target channel',
    async () => {
      await withTempHome(async (tempRoot) => {
        clearModuleCache();

        const service = require('../src/server/services/gemini-channels');
        const { handleChannelCommand } = require('../src/commands/channel');

        const first = service.createChannel(
          'Gemini First',
          'https://first.gemini.example.com',
          'gemini-first-key',
          'gemini-2.5-pro'
        );
        const second = service.createChannel(
          'Gemini Second',
          'https://second.gemini.example.com',
          'gemini-second-key',
          'gemini-2.5-flash'
        );

        await handleChannelCommand(['switch', 'gemini', second.name]);

        const channels = service.getChannels().channels;
        const savedFirst = channels.find((channel) => channel.id === first.id);
        const savedSecond = channels.find((channel) => channel.id === second.id);
        const envPath = path.join(tempRoot, '.gemini', '.env');
        const envContent = fs.readFileSync(envPath, 'utf8');

        assert.strictEqual(savedFirst.enabled, false);
        assert.strictEqual(savedSecond.enabled, true);
        assert.ok(envContent.includes('GOOGLE_GEMINI_BASE_URL=https://second.gemini.example.com'));
        assert.ok(envContent.includes('GEMINI_API_KEY=gemini-second-key'));
        assert.ok(envContent.includes('GEMINI_MODEL=gemini-2.5-flash'));
      });
    },
    failures
  );

  if (failures.length > 0) {
    const summary = failures
      .map((item, index) => `${index + 1}. ${item.name}: ${item.error.message}`)
      .join('\n');
    throw new Error(`Channel CLI command tests failed:\n${summary}`);
  }

  console.log('Channel CLI command tests passed');
}

runChannelCliCommandTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
