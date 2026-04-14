const assert = require('assert');
const express = require('express');
const fs = require('fs');
const http = require('http');
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

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-gemini-hooks-test-')
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

function loadGeminiHooksRouter() {
  delete require.cache[require.resolve('../src/server/api/gemini-hooks')];
  delete require.cache[require.resolve('../src/server/services/gemini-config')];
  delete require.cache[require.resolve('../src/utils/app-path-manager')];
  return require('../src/server/api/gemini-hooks');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function startServer(router) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/gemini/hooks', router);

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function runGeminiHooksTests() {
  await withTempHome(async () => {
    const router = loadGeminiHooksRouter();
    assert.strictEqual(typeof router.initDefaultHooks, 'function');

    const { server, port } = await startServer(router);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/gemini/hooks`);
      const json = await res.json();

      assert.strictEqual(json.success, true);
      assert.deepStrictEqual(json.afterAgentHook, {
        enabled: false,
        type: 'notification'
      });
      assert.deepStrictEqual(json.feishu, {
        enabled: false,
        webhookUrl: ''
      });
      assert.ok(['darwin', 'win32', 'linux'].includes(json.platform));
    } finally {
      server.close();
    }
  });

  await withTempHome(async (tempRoot) => {
    const geminiDir = path.join(tempRoot, '.gemini');
    const settingsPath = path.join(geminiDir, 'settings.json');
    const appDir = path.join(tempRoot, '.claude', 'cctoolbox');
    const uiConfigPath = path.join(appDir, 'ui-config.json');
    const notifyScriptPath = path.join(appDir, 'gemini-notify-hook.js');

    ensureDir(geminiDir);
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          ui: { theme: 'dark' },
          hooks: {
            BeforeTool: [
              { type: 'command', command: 'echo before-tool' }
            ]
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const router = loadGeminiHooksRouter();
    const { server, port } = await startServer(router);
    try {
      const saveRes = await fetch(`http://127.0.0.1:${port}/api/gemini/hooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          afterAgentHook: { enabled: true, type: 'notification' },
          feishu: {
            enabled: true,
            webhookUrl: 'https://example.com/feishu-hook'
          }
        })
      });
      const saveJson = await saveRes.json();

      assert.strictEqual(saveJson.success, true);
      assert.strictEqual(saveJson.afterAgentHook.enabled, true);
      assert.strictEqual(saveJson.afterAgentHook.type, 'notification');
      assert.strictEqual(saveJson.feishu.enabled, true);

      const settings = readJson(settingsPath);
      assert.strictEqual(settings.ui.theme, 'dark');
      assert.strictEqual(settings.hooks.BeforeTool[0].command, 'echo before-tool');
      // AfterAgent 使用嵌套格式: [{ hooks: [{ type, command }] }]
      assert.ok(Array.isArray(settings.hooks.AfterAgent));
      assert.strictEqual(settings.hooks.AfterAgent.length, 1);
      assert.ok(settings.hooks.AfterAgent[0].hooks);
      assert.ok(Array.isArray(settings.hooks.AfterAgent[0].hooks));
      assert.strictEqual(settings.hooks.AfterAgent[0].hooks[0].type, 'command');
      assert.ok(
        settings.hooks.AfterAgent[0].hooks[0].command.includes('gemini-notify-hook.js')
      );

      assert.strictEqual(fs.existsSync(notifyScriptPath), true);
      const scriptContent = fs.readFileSync(notifyScriptPath, 'utf8');
      assert.ok(scriptContent.includes('Gemini CLI 任务已完成'));

      const uiConfig = readJson(uiConfigPath);
      assert.deepStrictEqual(uiConfig.feishuNotification, {
        enabled: true,
        webhookUrl: 'https://example.com/feishu-hook'
      });
    } finally {
      server.close();
    }
  });

  await withTempHome(async (tempRoot) => {
    const geminiDir = path.join(tempRoot, '.gemini');
    const settingsPath = path.join(geminiDir, 'settings.json');
    const appDir = path.join(tempRoot, '.claude', 'cctoolbox');
    const notifyScriptPath = path.join(appDir, 'gemini-notify-hook.js');

    ensureDir(geminiDir);
    ensureDir(appDir);
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          profile: { locale: 'zh-CN' },
          hooks: {
            BeforeTool: [{ type: 'command', command: 'echo before' }],
            AfterAgent: [{ type: 'command', command: `node "${notifyScriptPath}"` }]
          }
        },
        null,
        2
      ),
      'utf8'
    );
    fs.writeFileSync(notifyScriptPath, '#!/usr/bin/env node\n', 'utf8');

    const router = loadGeminiHooksRouter();
    const { server, port } = await startServer(router);
    try {
      const saveRes = await fetch(`http://127.0.0.1:${port}/api/gemini/hooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          afterAgentHook: { enabled: false, type: 'notification' },
          feishu: { enabled: false, webhookUrl: '' }
        })
      });
      const saveJson = await saveRes.json();

      assert.strictEqual(saveJson.success, true);
      const settings = readJson(settingsPath);
      assert.strictEqual(settings.profile.locale, 'zh-CN');
      assert.ok(settings.hooks.BeforeTool);
      assert.strictEqual(settings.hooks.AfterAgent, undefined);
      assert.strictEqual(fs.existsSync(notifyScriptPath), false);
    } finally {
      server.close();
    }
  });

  await withTempHome(async () => {
    const childProcess = require('child_process');
    const originalExecSync = childProcess.execSync;
    let executedCommand = '';
    childProcess.execSync = (command) => {
      executedCommand = command;
      return Buffer.from('');
    };

    const router = loadGeminiHooksRouter();
    const { server, port } = await startServer(router);

    try {
      const testRes = await fetch(`http://127.0.0.1:${port}/api/gemini/hooks/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'notification' })
      });
      const testJson = await testRes.json();

      assert.strictEqual(testJson.success, true);
      assert.ok(executedCommand.length > 0);
    } finally {
      childProcess.execSync = originalExecSync;
      server.close();
    }
  });

  await withTempHome(async () => {
    let receivedBody = null;
    const webhookServer = await new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          receivedBody = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      });
      server.listen(0, () => resolve(server));
    });

    const webhookPort = webhookServer.address().port;
    const webhookUrl = `http://127.0.0.1:${webhookPort}/webhook`;

    const router = loadGeminiHooksRouter();
    const { server, port } = await startServer(router);

    try {
      const testRes = await fetch(`http://127.0.0.1:${port}/api/gemini/hooks/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testFeishu: true,
          webhookUrl
        })
      });
      const testJson = await testRes.json();

      assert.strictEqual(testJson.success, true);
      assert.strictEqual(testJson.message, '飞书测试通知已发送');
      assert.strictEqual(receivedBody.msg_type, 'interactive');
    } finally {
      server.close();
      webhookServer.close();
    }
  });

  console.log('Gemini hooks API tests passed');
}

runGeminiHooksTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
