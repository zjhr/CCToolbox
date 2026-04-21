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

function clearAllChannelModules() {
  clearModuleCache([
    '../src/server/api/channels',
    '../src/server/api/codex-channels',
    '../src/server/api/gemini-channels',
    '../src/server/services/channels',
    '../src/server/services/codex-channels',
    '../src/server/services/gemini-channels',
    '../src/server/services/codex-config',
    '../src/server/services/codex-settings-manager',
    '../src/server/services/channel-health',
    '../src/server/services/channel-scheduler',
    '../src/server/services/speed-test',
    '../src/server/services/gemini-config',
    '../src/server/websocket-server',
    '../src/utils/app-path-manager'
  ]);
}

function loadClaudeChannelsService() {
  clearAllChannelModules();
  return require('../src/server/services/channels');
}

function loadCodexChannelsService() {
  clearAllChannelModules();
  return require('../src/server/services/codex-channels');
}

function loadGeminiChannelsService() {
  clearAllChannelModules();
  return require('../src/server/services/gemini-channels');
}

function loadClaudeChannelsRouter() {
  clearAllChannelModules();
  return require('../src/server/api/channels');
}

function loadCodexChannelsRouter() {
  clearAllChannelModules();
  return require('../src/server/api/codex-channels')({});
}

function loadGeminiChannelsRouter() {
  clearAllChannelModules();
  return require('../src/server/api/gemini-channels')({});
}

function hasRoute(router, method, routePath) {
  return router.stack.some((layer) => (
    layer.route &&
    layer.route.path === routePath &&
    layer.route.methods &&
    layer.route.methods[method]
  ));
}

function readClaudeSettings(tempRoot) {
  const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-channel-model-config-test-')
  );
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalCctoolboxHome = process.env.CCTOOLBOX_HOME;

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
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

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }

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

async function runTests() {
  const failures = [];

  await runTestCase(
    'custom-models 路由应在三种渠道 API 中注册',
    async () => {
      await withTempHome(async () => {
        const claudeRouter = loadClaudeChannelsRouter();
        const codexRouter = loadCodexChannelsRouter();
        const geminiRouter = loadGeminiChannelsRouter();

        assert.ok(hasRoute(claudeRouter, 'put', '/:id/custom-models'));
        assert.ok(hasRoute(codexRouter, 'put', '/:channelId/custom-models'));
        assert.ok(hasRoute(geminiRouter, 'put', '/:channelId/custom-models'));
      });
    },
    failures
  );

  await runTestCase(
    '相同 URL 切换渠道时应写入最新 modelConfig（不依赖 presetId）',
    async () => {
      await withTempHome(async (tempRoot) => {
        ensureDir(path.join(tempRoot, '.claude'));
        const service = loadClaudeChannelsService();
        const originalNow = Date.now;
        let now = 1000;
        let channelA;
        let channelB;
        try {
          Date.now = () => {
            now += 1;
            return now;
          };

          channelA = service.createChannel(
            'A',
            'https://api.deepseek.com/anthropic',
            'sk-same',
            '',
            {
              presetId: 'deepseek',
              modelConfig: { model: 'deepseek-chat' }
            }
          );
          channelB = service.createChannel(
            'B',
            'https://api.deepseek.com/anthropic',
            'sk-same',
            '',
            {
              modelConfig: { model: 'deepseek-reasoner' }
            }
          );
        } finally {
          Date.now = originalNow;
        }

        service.applyChannelToSettings(channelA.id);
        let settings = readClaudeSettings(tempRoot);
        assert.strictEqual(settings.env.ANTHROPIC_MODEL, 'deepseek-chat');

        service.applyChannelToSettings(channelB.id);
        settings = readClaudeSettings(tempRoot);
        assert.strictEqual(settings.env.ANTHROPIC_MODEL, 'deepseek-reasoner');
      });
    },
    failures
  );

  await runTestCase(
    'enable1M 应正确映射 CLAUDE_CODE_DISABLE_1M_CONTEXT',
    async () => {
      await withTempHome(async (tempRoot) => {
        ensureDir(path.join(tempRoot, '.claude'));
        const service = loadClaudeChannelsService();
        const originalNow = Date.now;
        let now = 2000;
        let channelEnable;
        let channelDisable;
        let channelUnset;
        try {
          Date.now = () => {
            now += 1;
            return now;
          };

          channelEnable = service.createChannel(
            'Enable 1M',
            'https://api.anthropic.com',
            'sk-enable',
            '',
            { enable1M: true }
          );
          channelDisable = service.createChannel(
            'Disable 1M',
            'https://api.anthropic.com',
            'sk-disable',
            '',
            { enable1M: false }
          );
          channelUnset = service.createChannel(
            'Unset 1M',
            'https://api.anthropic.com',
            'sk-unset'
          );
        } finally {
          Date.now = originalNow;
        }

        service.applyChannelToSettings(channelEnable.id);
        let settings = readClaudeSettings(tempRoot);
        assert.strictEqual(settings.env.CLAUDE_CODE_DISABLE_1M_CONTEXT, '0');

        service.applyChannelToSettings(channelDisable.id);
        settings = readClaudeSettings(tempRoot);
        assert.strictEqual(settings.env.CLAUDE_CODE_DISABLE_1M_CONTEXT, '1');

        service.applyChannelToSettings(channelUnset.id);
        settings = readClaudeSettings(tempRoot);
        assert.strictEqual(
          Object.prototype.hasOwnProperty.call(
            settings.env,
            'CLAUDE_CODE_DISABLE_1M_CONTEXT'
          ),
          false
        );
      });
    },
    failures
  );

  await runTestCase(
    'applyChannelToSettings 应写入 ENABLE_TOOL_SEARCH=1',
    async () => {
      await withTempHome(async (tempRoot) => {
        ensureDir(path.join(tempRoot, '.claude'));
        const service = loadClaudeChannelsService();
        const channel = service.createChannel(
          'ToolSearch One',
          'https://api.anthropic.com',
          'sk-tool-one'
        );

        service.updateChannel(channel.id, { enableToolSearch: '1' });
        service.applyChannelToSettings(channel.id);

        const settings = readClaudeSettings(tempRoot);
        assert.strictEqual(settings.env.ENABLE_TOOL_SEARCH, '1');
      });
    },
    failures
  );

  await runTestCase(
    'applyChannelToSettings 应写入 ENABLE_TOOL_SEARCH=0',
    async () => {
      await withTempHome(async (tempRoot) => {
        ensureDir(path.join(tempRoot, '.claude'));
        const service = loadClaudeChannelsService();
        const channel = service.createChannel(
          'ToolSearch Zero',
          'https://api.anthropic.com',
          'sk-tool-zero'
        );

        service.updateChannel(channel.id, { enableToolSearch: '0' });
        service.applyChannelToSettings(channel.id);

        const settings = readClaudeSettings(tempRoot);
        assert.strictEqual(settings.env.ENABLE_TOOL_SEARCH, '0');
      });
    },
    failures
  );

  await runTestCase(
    'applyChannelToSettings 应写入 ENABLE_TOOL_SEARCH=auto',
    async () => {
      await withTempHome(async (tempRoot) => {
        ensureDir(path.join(tempRoot, '.claude'));
        const service = loadClaudeChannelsService();
        const channel = service.createChannel(
          'ToolSearch Auto',
          'https://api.anthropic.com',
          'sk-tool-auto'
        );

        service.updateChannel(channel.id, { enableToolSearch: 'auto' });
        service.applyChannelToSettings(channel.id);

        const settings = readClaudeSettings(tempRoot);
        assert.strictEqual(settings.env.ENABLE_TOOL_SEARCH, 'auto');
      });
    },
    failures
  );

  await runTestCase(
    'createChannel 应保存 enableToolSearch 字段',
    async () => {
      await withTempHome(async () => {
        const service = loadClaudeChannelsService();
        const channel = service.createChannel(
          'Create ToolSearch',
          'https://api.anthropic.com',
          'sk-create-tool',
          '',
          { enableToolSearch: 'auto' }
        );

        assert.strictEqual(channel.enableToolSearch, 'auto');
        const reloaded = service.getAllChannels().find((item) => item.id === channel.id);
        assert.strictEqual(reloaded.enableToolSearch, 'auto');
      });
    },
    failures
  );

  await runTestCase(
    'updateChannel 应更新 enableToolSearch 字段',
    async () => {
      await withTempHome(async (tempRoot) => {
        ensureDir(path.join(tempRoot, '.claude'));
        const service = loadClaudeChannelsService();
        const channel = service.createChannel(
          'Update ToolSearch',
          'https://api.anthropic.com',
          'sk-update-tool'
        );

        const updated = service.updateChannel(channel.id, { enableToolSearch: '0' });
        assert.strictEqual(updated.enableToolSearch, '0');

        const reloaded = service.getAllChannels().find((item) => item.id === channel.id);
        assert.strictEqual(reloaded.enableToolSearch, '0');

        service.applyChannelToSettings(channel.id);
        const settings = readClaudeSettings(tempRoot);
        assert.strictEqual(settings.env.ENABLE_TOOL_SEARCH, '0');
      });
    },
    failures
  );

  await runTestCase(
    'updateCustomModels 应支持 claude/codex/gemini 的统一更新与清空',
    async () => {
      await withTempHome(async () => {
        const claudeService = loadClaudeChannelsService();
        const codexService = loadCodexChannelsService();
        const geminiService = loadGeminiChannelsService();

        const claudeChannel = claudeService.createChannel(
          'Claude',
          'https://api.anthropic.com',
          'sk-claude'
        );
        const codexChannel = codexService.createChannel(
          'Codex',
          'provider-custom',
          'https://example.com/v1',
          ''
        );
        const geminiChannel = geminiService.createChannel(
          'Gemini',
          'https://example.com',
          'gm-key',
          'gemini-2.5-pro'
        );

        claudeService.updateCustomModels(claudeChannel.id, ['claude-a', 'claude-b', 'claude-a'], 'claude');
        claudeService.updateCustomModels(codexChannel.id, ['gpt-5.5-mini'], 'codex');
        claudeService.updateCustomModels(geminiChannel.id, ['gemini-2.5-pro-preview'], 'gemini');

        const updatedClaude = claudeService.getAllChannels().find((item) => item.id === claudeChannel.id);
        const updatedCodex = codexService.getChannels().channels.find((item) => item.id === codexChannel.id);
        const updatedGemini = geminiService.getChannels().channels.find((item) => item.id === geminiChannel.id);

        assert.deepStrictEqual(updatedClaude.customModels, ['claude-a', 'claude-b']);
        assert.deepStrictEqual(updatedCodex.customModels, ['gpt-5.5-mini']);
        assert.deepStrictEqual(updatedGemini.customModels, ['gemini-2.5-pro-preview']);

        claudeService.updateCustomModels(claudeChannel.id, [], 'claude');
        const clearedClaude = claudeService.getAllChannels().find((item) => item.id === claudeChannel.id);
        assert.deepStrictEqual(clearedClaude.customModels, []);
      });
    },
    failures
  );

  await runTestCase(
    '旧版渠道数据缺失 customModels 时应回填为空数组',
    async () => {
      await withTempHome(async (tempRoot) => {
        const appDir = path.join(tempRoot, '.claude', 'cctoolbox');
        ensureDir(appDir);

        fs.writeFileSync(
          path.join(appDir, 'channels.json'),
          JSON.stringify({
            channels: [
              {
                id: 'legacy-claude',
                name: 'Legacy Claude',
                baseUrl: 'https://api.anthropic.com',
                apiKey: 'legacy-key'
              }
            ]
          }, null, 2),
          'utf8'
        );

        fs.writeFileSync(
          path.join(appDir, 'codex-channels.json'),
          JSON.stringify({
            channels: [
              {
                id: 'legacy-codex',
                name: 'Legacy Codex',
                providerKey: 'legacy-provider',
                baseUrl: 'https://example.com/v1',
                apiKey: '',
                enabled: true
              }
            ]
          }, null, 2),
          'utf8'
        );

        fs.writeFileSync(
          path.join(appDir, 'gemini-channels.json'),
          JSON.stringify({
            channels: [
              {
                id: 'legacy-gemini',
                name: 'Legacy Gemini',
                baseUrl: 'https://example.com',
                apiKey: '',
                model: 'gemini-2.5-pro'
              }
            ]
          }, null, 2),
          'utf8'
        );

        const claudeService = loadClaudeChannelsService();
        const codexService = loadCodexChannelsService();
        const geminiService = loadGeminiChannelsService();

        const claudeChannel = claudeService.getAllChannels().find((item) => item.id === 'legacy-claude');
        const codexChannel = codexService.getChannels().channels.find((item) => item.id === 'legacy-codex');
        const geminiChannel = geminiService.getChannels().channels.find((item) => item.id === 'legacy-gemini');

        assert.deepStrictEqual(claudeChannel.customModels, []);
        assert.deepStrictEqual(codexChannel.customModels, []);
        assert.deepStrictEqual(geminiChannel.customModels, []);
      });
    },
    failures
  );

  if (failures.length > 0) {
    const summary = failures
      .map((item, index) => `${index + 1}. ${item.name}: ${item.error.message}`)
      .join('\n');
    throw new Error(`channels-model-config tests failed:\n${summary}`);
  }

  console.log('channels-model-config tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
