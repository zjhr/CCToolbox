const assert = require('assert');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-ai-api-test-'));
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

async function runApiTests() {
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { saveAIConfig } = require('../src/server/services/ai-config');
    saveAIConfig({
      defaultProvider: 'ollama',
      providers: {
        ollama: { enabled: true, baseUrl: 'http://localhost:11434', modelName: 'qwen2.5:14b' }
      },
      presetTags: ['bug', 'feature'],
      privacyAccepted: true
    });

    const { server, port } = await startServer();
    try {
      const configRes = await fetch(`http://127.0.0.1:${port}/api/ai-config`);
      const configJson = await configRes.json();
      assert.strictEqual(configJson.success, true);
      assert.strictEqual(configJson.config.defaultProvider, 'ollama');

      const tagsRes = await fetch(`http://127.0.0.1:${port}/api/ai-config/tags`);
      const tagsJson = await tagsRes.json();
      assert.strictEqual(tagsJson.success, true);
      assert.deepStrictEqual(tagsJson.tags, ['bug', 'feature']);

      const metaRes = await fetch(`http://127.0.0.1:${port}/api/ai-assistant/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session-1',
          title: '测试标题',
          tags: ['tag-a']
        })
      });
      const metaJson = await metaRes.json();
      assert.strictEqual(metaJson.success, true);
      assert.strictEqual(metaJson.data.title, '测试标题');

      const metaGetRes = await fetch(`http://127.0.0.1:${port}/api/ai-assistant/metadata/session-1`);
      const metaGetJson = await metaGetRes.json();
      assert.strictEqual(metaGetJson.success, true);
      assert.strictEqual(metaGetJson.data.title, '测试标题');
    } finally {
      server.close();
    }
  });

  console.log('AI API tests passed');
}

runApiTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
