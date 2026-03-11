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

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-gemini-channels-test-')
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

function loadGeminiChannelsService() {
  delete require.cache[require.resolve('../src/server/services/gemini-channels')];
  delete require.cache[require.resolve('../src/utils/app-path-manager')];
  return require('../src/server/services/gemini-channels');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function runGeminiChannelTests() {
  await withTempHome(async (tempRoot) => {
    const geminiDir = path.join(tempRoot, '.gemini');
    const envPath = path.join(geminiDir, '.env');
    const settingsPath = path.join(geminiDir, 'settings.json');
    const snapshotPath = path.join(
      tempRoot,
      '.claude',
      'cctoolbox',
      'gemini-selected-type-snapshot.json'
    );

    ensureDir(geminiDir);
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          ui: { theme: 'dark' },
          security: {
            auth: {
              selectedType: 'oauth-personal',
              keep: 'custom-auth'
            }
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const { createChannel, clearGeminiConfig } = loadGeminiChannelsService();
    createChannel(
      'Primary',
      'https://example.com',
      'secret-key',
      'gemini-2.5-pro'
    );

    const snapshot = readJson(snapshotPath);
    assert.strictEqual(snapshot.hasSelectedType, true);
    assert.strictEqual(snapshot.value, 'oauth-personal');

    let settings = readJson(settingsPath);
    assert.strictEqual(settings.security.auth.selectedType, 'gemini-api-key');

    const result = clearGeminiConfig();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.cleared, true);

    const cleanedEnv = fs.readFileSync(envPath, 'utf8');
    assert.ok(!cleanedEnv.includes('GOOGLE_GEMINI_BASE_URL='));
    assert.ok(!cleanedEnv.includes('GEMINI_API_KEY='));
    assert.ok(!cleanedEnv.includes('GEMINI_MODEL='));

    settings = readJson(settingsPath);
    assert.strictEqual(settings.ui.theme, 'dark');
    assert.strictEqual(settings.security.auth.keep, 'custom-auth');
    assert.strictEqual(settings.security.auth.selectedType, 'oauth-personal');
    assert.ok(!fs.existsSync(snapshotPath));
  });

  await withTempHome(async (tempRoot) => {
    const geminiDir = path.join(tempRoot, '.gemini');
    const envPath = path.join(geminiDir, '.env');
    const settingsPath = path.join(geminiDir, 'settings.json');

    ensureDir(geminiDir);
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          ui: { theme: 'dark' }
        },
        null,
        2
      ),
      'utf8'
    );

    const {
      createChannel,
      clearGeminiConfig,
      writeGeminiConfigForSingleChannel
    } = loadGeminiChannelsService();

    const channel = createChannel(
      'Primary',
      'https://example.com',
      'secret-key',
      'gemini-2.5-pro'
    );

    clearGeminiConfig();
    let settings = readJson(settingsPath);
    assert.strictEqual(settings.ui.theme, 'dark');
    assert.ok(!settings.security || !settings.security.auth);

    writeGeminiConfigForSingleChannel(channel.id);

    settings = readJson(settingsPath);
    assert.strictEqual(settings.ui.theme, 'dark');
    assert.strictEqual(settings.security.auth.selectedType, 'gemini-api-key');

    const envContent = fs.readFileSync(envPath, 'utf8');
    assert.ok(envContent.includes('GOOGLE_GEMINI_BASE_URL=https://example.com'));
    assert.ok(envContent.includes('GEMINI_API_KEY=secret-key'));
    assert.ok(envContent.includes('GEMINI_MODEL=gemini-2.5-pro'));
  });

  await withTempHome(async (tempRoot) => {
    const geminiDir = path.join(tempRoot, '.gemini');
    const settingsPath = path.join(geminiDir, 'settings.json');
    const envPath = path.join(geminiDir, '.env');
    const snapshotPath = path.join(
      tempRoot,
      '.claude',
      'cctoolbox',
      'gemini-selected-type-snapshot.json'
    );

    ensureDir(geminiDir);
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          security: {
            auth: {
              selectedType: 'oauth-personal'
            }
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const { createChannel, deleteChannel } = loadGeminiChannelsService();

    const channel = createChannel(
      'Primary',
      'https://example.com',
      'secret-key',
      'gemini-2.5-pro'
    );

    let settings = readJson(settingsPath);
    assert.strictEqual(settings.security.auth.selectedType, 'gemini-api-key');

    deleteChannel(channel.id);

    settings = readJson(settingsPath);
    assert.strictEqual(settings.security.auth.selectedType, 'oauth-personal');

    const envContent = fs.readFileSync(envPath, 'utf8');
    assert.ok(envContent.includes('All channels are currently disabled'));
    assert.ok(!fs.existsSync(snapshotPath));
  });

  console.log('Gemini channel tests passed');
}

runGeminiChannelTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
