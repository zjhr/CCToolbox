const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-ai-service-test-'));
  try {
    return await run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

async function runServiceTests() {
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { saveAIConfig } = require('../src/server/services/ai-config');
    const { getAIServiceManager } = require('../src/server/services/ai-service');

    saveAIConfig({
      defaultProvider: 'openai',
      providers: {
        openai: {
          enabled: true,
          baseUrl: 'https://api.openai.com/v1',
          modelName: 'gpt-4o-mini',
          apiKey: ''
        }
      }
    });

    const aiService = getAIServiceManager();
    try {
      await aiService.testConnection('openai');
      assert.fail('Expected error for missing API Key');
    } catch (error) {
      assert.strictEqual(error.code, 'OPENAI_CONFIG_ERROR');
      assert.strictEqual(error.status, 400);
    }

    saveAIConfig({
      defaultProvider: 'openai',
      providers: {
        openai: {
          enabled: false,
          baseUrl: 'https://api.openai.com/v1',
          modelName: 'gpt-4o-mini',
          apiKey: 'secret'
        }
      }
    });

    try {
      await aiService.requestCompletion({
        providerKey: 'openai',
        messages: [{ role: 'user', content: 'hello' }]
      });
      assert.fail('Expected error for disabled provider');
    } catch (error) {
      assert.strictEqual(error.code, 'PROVIDER_DISABLED');
      assert.strictEqual(error.status, 400);
    }
  });

  console.log('AI service tests passed');
}

runServiceTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
