const assert = require('assert');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function encodeProjectPath(fullPath) {
  return `-${fullPath.replace(/\//g, '-')}`;
}

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-ai-int-test-'));
  try {
    return await run(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/ai-config', require('../src/server/api/ai-config'));
  app.use('/api/ai-assistant', require('../src/server/api/ai-assistant'));
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function runIntegrationTests() {
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;

    const projectPath = path.join(tempRoot, 'project-demo');
    const sessionId = 'session-789';
    const sessionsDir = path.join(projectPath, '.claude', 'sessions');
    ensureDir(sessionsDir);
    const sessionFile = path.join(sessionsDir, `${sessionId}.jsonl`);
    const lines = [
      JSON.stringify({ type: 'user', message: { content: '我要实现登录功能' } }),
      JSON.stringify({ type: 'assistant', message: { content: '可以使用 JWT 方案' } }),
      JSON.stringify({ type: 'user', message: { content: '需要权限控制' } })
    ];
    fs.writeFileSync(sessionFile, lines.join('\n') + '\n', 'utf8');

    const configPayload = {
      defaultProvider: 'openai',
      providers: {
        openai: {
          enabled: true,
          baseUrl: 'http://mock-openai.local',
          modelName: 'gpt-4o-mini',
          apiKey: 'test-key'
        }
      },
      privacyAccepted: true
    };

    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (typeof url === 'string' && url.startsWith('http://127.0.0.1:')) {
        return originalFetch(url, options);
      }
      let prompt = '';
      if (options?.body) {
        try {
          const payload = JSON.parse(options.body);
          const messages = payload.messages || [];
          prompt = messages.map(item => item.content || '').join('\n');
        } catch (error) {
          prompt = '';
        }
      }
      const summaryContent = '## 主要内容\\n- 讨论登录方案\\n## 关键决策\\n- 选择 JWT\\n## 风险与待办\\n- 无';
      const aliasContent = '{"title":"登录功能设计","tags":["auth","feature"]}';
      const content = prompt.includes('Markdown') || prompt.includes('总结') ? summaryContent : aliasContent;
      const text = JSON.stringify({ choices: [{ message: { content } }] });
      return {
        ok: true,
        status: 200,
        async text() {
          return text;
        }
      };
    };

    const { server, port } = await startServer();
    try {
      const saveRes = await fetch(`http://127.0.0.1:${port}/api/ai-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configPayload })
      });
      const saveJson = await saveRes.json();
      assert.strictEqual(saveJson.success, true);

      const testRes = await fetch(`http://127.0.0.1:${port}/api/ai-config/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai' })
      });
      const testJson = await testRes.json();
      assert.strictEqual(testJson.success, true);
      assert.strictEqual(testJson.result.provider, 'openai');

      const projectName = encodeProjectPath(projectPath);
      const aliasRes = await fetch(`http://127.0.0.1:${port}/api/ai-assistant/generate-alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, sessionId })
      });
      const aliasJson = await aliasRes.json();
      assert.strictEqual(aliasJson.success, true);
      assert.strictEqual(aliasJson.data.title, '登录功能设计');
      assert.ok(aliasJson.data.tags.includes('auth'));

      const summaryRes = await fetch(`http://127.0.0.1:${port}/api/ai-assistant/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, sessionId })
      });
      const summaryJson = await summaryRes.json();
      assert.strictEqual(summaryJson.success, true);
      assert.ok(summaryJson.data.summary && summaryJson.data.summary.includes('##'));

      const getSummaryRes = await fetch(`http://127.0.0.1:${port}/api/ai-assistant/summary/${projectName}/${sessionId}`);
      const getSummaryJson = await getSummaryRes.json();
      assert.strictEqual(getSummaryJson.success, true);
      assert.ok(getSummaryJson.data.summary && getSummaryJson.data.summary.includes('##'));
    } finally {
      server.close();
      global.fetch = originalFetch;
    }
  });

  console.log('AI integration tests passed');
}

runIntegrationTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
