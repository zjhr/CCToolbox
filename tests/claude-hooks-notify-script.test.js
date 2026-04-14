const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function clearModuleCache() {
  const modules = [
    '../src/server/api/claude-hooks',
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

function loadClaudeHooksTestApi() {
  clearModuleCache();
  const router = require('../src/server/api/claude-hooks');
  return router.__test__;
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-claude-hooks-notify-test-')
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
    'generateSystemNotificationCommand 应根据 channelName 生成对应文案且默认兼容 Claude',
    async () => {
      const testApi = loadClaudeHooksTestApi();
      assert.ok(testApi, '应导出 __test__ 测试接口');

      const claudeCmd = testApi.generateSystemNotificationCommand('dialog');
      const codexCmd = testApi.generateSystemNotificationCommand('dialog', 'codex');
      const geminiCmd = testApi.generateSystemNotificationCommand('dialog', 'gemini');

      assert.ok(claudeCmd.includes('Claude Code 任务已完成 | 等待交互'));
      assert.ok(codexCmd.includes('Codex CLI 任务已完成 | 等待交互'));
      assert.ok(geminiCmd.includes('Gemini CLI 任务已完成 | 等待交互'));
    },
    failures
  );

  await runTestCase(
    'generateNotifyScript 飞书卡片标题和内容应包含渠道名称',
    async () => {
      const testApi = loadClaudeHooksTestApi();
      assert.ok(testApi, '应导出 __test__ 测试接口');

      const script = testApi.generateNotifyScript(
        {
          systemNotification: { enabled: true, type: 'notification' },
          feishu: { enabled: true, webhookUrl: 'https://example.com/webhook' }
        },
        'codex'
      );

      assert.ok(script.includes('Codex CLI'));
      assert.ok(script.includes('任务已完成 | 等待交互'));
    },
    failures
  );

  await runTestCase(
    'writeNotifyScript 应根据渠道写入不同脚本文件名',
    async () => {
      await withTempHome(async () => {
        const testApi = loadClaudeHooksTestApi();
        assert.ok(testApi, '应导出 __test__ 测试接口');

        const config = {
          systemNotification: { enabled: false, type: 'notification' },
          feishu: { enabled: false, webhookUrl: '' }
        };

        const wroteCodex = testApi.writeNotifyScript(config, 'codex');
        const wroteGemini = testApi.writeNotifyScript(config, 'gemini');
        const wroteClaude = testApi.writeNotifyScript(config);

        assert.strictEqual(wroteCodex, true);
        assert.strictEqual(wroteGemini, true);
        assert.strictEqual(wroteClaude, true);

        assert.strictEqual(fs.existsSync(testApi.getNotifyScriptPath('codex')), true);
        assert.strictEqual(fs.existsSync(testApi.getNotifyScriptPath('gemini')), true);
        assert.strictEqual(fs.existsSync(testApi.getNotifyScriptPath('claude')), true);
      });
    },
    failures
  );

  if (failures.length > 0) {
    const summary = failures
      .map((item, index) => `${index + 1}. ${item.name}: ${item.error.message}`)
      .join('\n');
    throw new Error(`Claude hooks notify script tests failed:\n${summary}`);
  }

  console.log('Claude hooks notify script tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
