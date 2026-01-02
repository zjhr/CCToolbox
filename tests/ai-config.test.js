const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-ai-config-test-'));
  try {
    return await run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

async function runConfigTests() {
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { getAppDir } = require('../src/utils/app-path-manager');
    const { saveAIConfig, loadAIConfig } = require('../src/server/services/ai-config');

    ensureDir(getAppDir());

    const saved = saveAIConfig({
      defaultProvider: 'openai',
      providers: {
        openai: {
          enabled: true,
          baseUrl: 'https://api.openai.com/v1',
          modelName: 'gpt-4o-mini',
          apiKey: 'secret-key'
        }
      },
      presetTags: ['bug', 'feature'],
      privacyAccepted: true
    });

    assert.strictEqual(saved.defaultProvider, 'openai');
    assert.strictEqual(saved.providers.openai.apiKey, '********');
    assert.strictEqual(saved.privacyAccepted, true);

    const masked = loadAIConfig();
    assert.strictEqual(masked.providers.openai.apiKey, '********');

    const withSecrets = loadAIConfig({ includeSecrets: true });
    assert.strictEqual(withSecrets.providers.openai.apiKey, 'secret-key');
    assert.strictEqual(withSecrets.presetTags.length, 2);
  });

  console.log('AI config tests passed');
}

runConfigTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
