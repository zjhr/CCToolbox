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

function clearModuleCache(modulePaths) {
  modulePaths.forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (error) {
      // ignore
    }
  });
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-proxy-start-test-')
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

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function run() {
  await withTempHome(async (tempRoot) => {
    const claudeDir = path.join(tempRoot, '.claude');
    const appDir = path.join(tempRoot, '.cctoolbox');
    ensureDir(claudeDir);
    ensureDir(appDir);

    writeJson(path.join(appDir, 'channels.json'), {
      channels: [
        {
          id: 'ch-cpa',
          name: 'CPA',
          baseUrl: 'https://cpacodex.example/v1',
          apiKey: 'sk-cpa',
          enabled: true,
          weight: 1,
          modelConfig: {
            haikuModel: 'deepseek-v4-flash',
            sonnetModel: 'deepseek-v4-flash',
            opusModel: 'deepseek-v4-flash',
          },
          customModels: ['deepseek-v4-flash'],
        },
        {
          id: 'ch-step',
          name: 'Step',
          baseUrl: 'https://step.example',
          apiKey: 'sk-step',
          enabled: true,
          weight: 1,
          modelConfig: {
            model: 'step-router-v1',
            haikuModel: 'step-3.7-flash',
            sonnetModel: 'step-3.7-flash',
            opusModel: 'step-3.7-flash',
          },
          customModels: ['step-3.7-flash', 'step-router-v1'],
        },
      ],
    });

    // stale proxy settings after restart (process dead, config still proxy)
    writeJson(path.join(claudeDir, 'settings.json'), {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:10088',
        ANTHROPIC_API_KEY: 'PROXY_KEY',
      },
      apiKeyHelper: "echo 'PROXY_KEY'",
    });
    writeJson(path.join(claudeDir, 'settings.json.cctoolbox-backup'), {
      env: {
        ANTHROPIC_BASE_URL: 'https://cpacodex.example/v1',
        ANTHROPIC_AUTH_TOKEN: 'sk-cpa',
      },
    });
    writeJson(path.join(appDir, 'active-channel.json'), {
      activeChannelId: 'ch-cpa',
    });

    clearModuleCache([
      '../src/server/api/proxy',
      '../src/server/services/settings-manager',
      '../src/server/services/channels',
      '../src/utils/app-path-manager',
      '../src/server/services/channel-scheduler',
      '../src/server/services/model-list',
    ]);

    const {
      resolveChannelForProxyStart,
      findActiveChannelFromSettings,
    } = require('../src/server/api/proxy');

    // direct settings match must fail on proxy leftover
    assert.strictEqual(
      findActiveChannelFromSettings(),
      null,
      'proxy leftover settings should not match a real channel'
    );

    const resolved = resolveChannelForProxyStart();
    assert.ok(resolved, 'should resolve a channel even when settings are proxy leftover');
    assert.strictEqual(resolved.id, 'ch-cpa', 'should prefer active-channel.json id');

    // model-aware scheduling helpers
    const {
      normalizeModelIdForMatch,
      channelDeclaresModels,
      channelSupportsModel,
      preferChannelsForModel,
    } = require('../src/server/services/channel-scheduler');

    assert.strictEqual(
      normalizeModelIdForMatch('deepseek-v4-flash[1m]'),
      'deepseek-v4-flash'
    );
    assert.strictEqual(
      normalizeModelIdForMatch('deepseek-v4-flash'),
      'deepseek-v4-flash'
    );

    const channels = require('../src/server/services/channels').getAllChannels();
    assert.strictEqual(channelDeclaresModels(channels[0]), true);
    assert.strictEqual(
      channelSupportsModel(channels[0], 'deepseek-v4-flash[1m]'),
      true
    );
    assert.strictEqual(
      channelSupportsModel(channels[1], 'deepseek-v4-flash[1m]'),
      false
    );

    const preferred = preferChannelsForModel(channels, 'deepseek-v4-flash[1m]');
    assert.strictEqual(preferred.length, 1);
    assert.strictEqual(preferred[0].id, 'ch-cpa');

    // no model => keep all
    assert.strictEqual(
      preferChannelsForModel(channels, null).length,
      2
    );

    // unknown model with only declared lists => fall back to unconstrained/all
    const noMatchPreferred = preferChannelsForModel(
      channels,
      'totally-unknown-model-xyz'
    );
    assert.strictEqual(
      noMatchPreferred.length,
      2,
      'when no channel matches, fall back to all candidates'
    );
  });

  console.log('proxy-start-resolve.test.js passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
