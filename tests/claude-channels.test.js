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

function clearClaudeModuleCache() {
  const modules = [
    '../src/server/api/channels',
    '../src/server/services/channels',
    '../src/server/services/channel-health',
    '../src/server/services/channel-scheduler',
    '../src/server/services/speed-test',
    '../src/server/websocket-server',
    '../src/utils/app-path-manager'
  ];

  modules.forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (error) {
      // ignore
    }
  });
}

function loadClaudeChannelsService() {
  clearClaudeModuleCache();
  return require('../src/server/services/channels');
}

function loadClaudeChannelsRouter() {
  clearClaudeModuleCache();
  return require('../src/server/api/channels');
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-claude-channels-test-')
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

async function invokeRoute(router, method, routePath, { body = {}, params = {}, query = {} } = {}) {
  const layer = router.stack.find((item) => {
    return item.route && item.route.path === routePath && item.route.methods[method];
  });

  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  }

  const req = { body, params, query };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };

  const handler = layer.route.stack[0].handle;
  const ret = handler(req, res, () => {});
  if (ret && typeof ret.then === 'function') {
    await ret;
  }

  return { statusCode: res.statusCode, body: res.payload };
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

async function runClaudeChannelTests() {
  const failures = [];

  await runTestCase(
    'POST /api/channels should preserve domestic model fields for edit form refill',
    async () => {
      await withTempHome(async () => {
        const router = loadClaudeChannelsRouter();

        const createRes = await invokeRoute(router, 'post', '/', {
          body: {
            name: 'DeepSeek 渠道',
            baseUrl: 'https://api.deepseek.com/anthropic',
            apiKey: 'sk-deepseek',
            websiteUrl: 'https://platform.deepseek.com',
            presetId: 'deepseek',
            modelConfig: {
              model: 'deepseek-chat',
              haikuModel: 'deepseek-chat',
              sonnetModel: 'deepseek-chat',
              opusModel: 'deepseek-chat'
            },
            proxyUrl: 'http://127.0.0.1:7890'
          }
        });

        assert.strictEqual(createRes.statusCode, 200);
        assert.strictEqual(createRes.body.channel.presetId, 'deepseek');
        assert.strictEqual(createRes.body.channel.modelConfig.model, 'deepseek-chat');
        assert.strictEqual(createRes.body.channel.proxyUrl, 'http://127.0.0.1:7890');

        const listRes = await invokeRoute(router, 'get', '/');
        const saved = listRes.body.channels[0];
        assert.strictEqual(saved.baseUrl, 'https://api.deepseek.com/anthropic');
        assert.strictEqual(saved.apiKey, 'sk-deepseek');
        assert.strictEqual(saved.presetId, 'deepseek');
        assert.strictEqual(saved.modelConfig.model, 'deepseek-chat');
      });
    },
    failures
  );

  await runTestCase(
    'GET /api/channels/current should use active channel ID when channels share same baseUrl',
    async () => {
      await withTempHome(async (tempRoot) => {
        ensureDir(path.join(tempRoot, '.claude'));

        const service = loadClaudeChannelsService();
        const router = loadClaudeChannelsRouter();
        const originalNow = Date.now;
        let now = 1000;
        let channelA = null;
        let channelB = null;
        try {
          Date.now = () => {
            now += 1;
            return now;
          };

          channelA = service.createChannel(
            'Claude A',
            'https://api.anthropic.com',
            'sk-same-token'
          );
          channelB = service.createChannel(
            'Claude B',
            'https://api.anthropic.com',
            'sk-same-token'
          );
        } finally {
          Date.now = originalNow;
        }

        assert.notStrictEqual(channelA.id, channelB.id);

        service.applyChannelToSettings(channelA.id);
        service.applyChannelToSettings(channelB.id);

        const currentRes = await invokeRoute(router, 'get', '/current');
        assert.strictEqual(currentRes.statusCode, 200);
        assert.ok(currentRes.body.channel);
        assert.strictEqual(currentRes.body.channel.id, channelB.id);
      });
    },
    failures
  );

  await runTestCase(
    'loadChannels should normalize legacy domestic fields (baseURL + model) for refill mapping',
    async () => {
      await withTempHome(async (tempRoot) => {
        const appDir = path.join(tempRoot, '.claude', 'cctoolbox');
        ensureDir(appDir);

        const channelsPath = path.join(appDir, 'channels.json');
        fs.writeFileSync(
          channelsPath,
          JSON.stringify(
            {
              channels: [
                {
                  id: 'legacy-channel',
                  name: 'Legacy DeepSeek',
                  baseURL: 'https://api.deepseek.com/anthropic',
                  apiKey: 'legacy-key',
                  model: 'deepseek-chat'
                }
              ]
            },
            null,
            2
          ),
          'utf8'
        );

        const service = loadClaudeChannelsService();
        const channels = service.getAllChannels();

        assert.strictEqual(channels.length, 1);
        assert.strictEqual(channels[0].baseUrl, 'https://api.deepseek.com/anthropic');
        assert.strictEqual(channels[0].apiKey, 'legacy-key');
        assert.ok(channels[0].modelConfig);
        assert.strictEqual(channels[0].modelConfig.model, 'deepseek-chat');
      });
    },
    failures
  );

  if (failures.length > 0) {
    const summary = failures
      .map((item, index) => `${index + 1}. ${item.name}: ${item.error.message}`)
      .join('\n');
    throw new Error(`Claude channels tests failed:\n${summary}`);
  }

  console.log('Claude channels tests passed');
}

runClaudeChannelTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
