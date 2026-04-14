const assert = require('assert');
const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

function withTempEnv(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-codex-hooks-test-'));
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalToolboxHome = process.env.CCTOOLBOX_HOME;

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
  process.env.CCTOOLBOX_HOME = tempRoot;

  return Promise.resolve()
    .then(() => run(tempRoot))
    .finally(() => {
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

      if (originalToolboxHome === undefined) {
        delete process.env.CCTOOLBOX_HOME;
      } else {
        process.env.CCTOOLBOX_HOME = originalToolboxHome;
      }

      fs.rmSync(tempRoot, { recursive: true, force: true });
    });
}

function loadCodexHooksRouter() {
  delete require.cache[require.resolve('../src/server/api/codex-hooks')];
  delete require.cache[require.resolve('../src/server/services/codex-config')];
  delete require.cache[require.resolve('../src/utils/app-path-manager')];
  return require('../src/server/api/codex-hooks');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/codex/hooks', loadCodexHooksRouter());
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({
        server,
        port: server.address().port
      });
    });
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function runTests() {
  await withTempEnv(async (tempRoot) => {
    const codexHooksPath = path.join(tempRoot, '.codex', 'hooks.json');
    const appDir = path.join(tempRoot, '.claude', 'cctoolbox');
    const uiConfigPath = path.join(appDir, 'ui-config.json');
    const notifyScriptPath = path.join(appDir, 'codex-notify-hook.js');

    const { server, port } = await startServer();

    try {
      const getDefaultRes = await fetch(`http://127.0.0.1:${port}/api/codex/hooks`);
      const getDefaultJson = await getDefaultRes.json();
      assert.strictEqual(getDefaultJson.success, true);
      assert.deepStrictEqual(getDefaultJson.stopHook, { enabled: false, type: 'notification' });
      assert.deepStrictEqual(getDefaultJson.feishu, { enabled: false, webhookUrl: '' });
      assert.strictEqual(getDefaultJson.platform, process.platform);

      fs.mkdirSync(path.dirname(codexHooksPath), { recursive: true });
      fs.writeFileSync(
        codexHooksPath,
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  { type: 'command', command: 'echo pretool' }
                ]
              }
            ]
          }
        }, null, 2),
        'utf8'
      );

      const saveRes = await fetch(`http://127.0.0.1:${port}/api/codex/hooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stopHook: { enabled: true, type: 'dialog' },
          feishu: { enabled: true, webhookUrl: 'https://example.com/hook' }
        })
      });
      const saveJson = await saveRes.json();
      assert.strictEqual(saveJson.success, true);
      assert.strictEqual(saveJson.stopHook.enabled, true);
      assert.strictEqual(saveJson.stopHook.type, 'dialog');
      assert.strictEqual(saveJson.feishu.enabled, true);

      const hooksAfterEnable = readJson(codexHooksPath);
      assert.ok(Array.isArray(hooksAfterEnable.hooks.PreToolUse));
      assert.ok(Array.isArray(hooksAfterEnable.hooks.Stop));
      assert.strictEqual(
        hooksAfterEnable.hooks.Stop[0].hooks[0].command,
        `node "${notifyScriptPath}"`
      );

      assert.strictEqual(fs.existsSync(notifyScriptPath), true);
      const scriptContent = fs.readFileSync(notifyScriptPath, 'utf8');
      assert.ok(scriptContent.includes('Codex CLI'));

      const uiConfig = readJson(uiConfigPath);
      assert.deepStrictEqual(uiConfig.feishuNotification, {
        enabled: true,
        webhookUrl: 'https://example.com/hook'
      });

      const getAfterEnableRes = await fetch(`http://127.0.0.1:${port}/api/codex/hooks`);
      const getAfterEnableJson = await getAfterEnableRes.json();
      assert.strictEqual(getAfterEnableJson.success, true);
      assert.strictEqual(getAfterEnableJson.stopHook.enabled, true);

      const disableRes = await fetch(`http://127.0.0.1:${port}/api/codex/hooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stopHook: { enabled: false, type: 'notification' },
          feishu: { enabled: false, webhookUrl: '' }
        })
      });
      const disableJson = await disableRes.json();
      assert.strictEqual(disableJson.success, true);

      const hooksAfterDisable = readJson(codexHooksPath);
      assert.ok(Array.isArray(hooksAfterDisable.hooks.PreToolUse));
      assert.strictEqual(hooksAfterDisable.hooks.Stop, undefined);
      assert.strictEqual(fs.existsSync(notifyScriptPath), false);

      const originalExecSync = childProcess.execSync;
      const execCalls = [];
      childProcess.execSync = (command) => {
        execCalls.push(command);
        return Buffer.from('');
      };

      try {
        const testSystemRes = await fetch(`http://127.0.0.1:${port}/api/codex/hooks/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'notification' })
        });
        const testSystemJson = await testSystemRes.json();
        assert.strictEqual(testSystemJson.success, true);
        assert.strictEqual(execCalls.length, 1);
      } finally {
        childProcess.execSync = originalExecSync;
      }

      const feishuServerPayload = await new Promise((resolve, reject) => {
        const feishuServer = http.createServer((req, res) => {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 0 }));
            feishuServer.close(() => {
              try {
                const payload = JSON.parse(body);
                resolve(payload);
              } catch (error) {
                reject(error);
              }
            });
          });
        });

        feishuServer.listen(0, async () => {
          const webhookUrl = `http://127.0.0.1:${feishuServer.address().port}/hook`;
          try {
            const testFeishuRes = await fetch(`http://127.0.0.1:${port}/api/codex/hooks/test`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'notification',
                testFeishu: true,
                webhookUrl
              })
            });
            const testFeishuJson = await testFeishuRes.json();
            assert.strictEqual(testFeishuJson.success, true);
          } catch (error) {
            feishuServer.close(() => reject(error));
          }
        });
      });

      assert.strictEqual(feishuServerPayload.msg_type, 'interactive');
    } finally {
      server.close();
    }
  });

  console.log('Codex hooks API tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
