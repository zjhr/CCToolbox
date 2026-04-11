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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-ai-meta-test-'));
  try {
    return await run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

async function runMetadataTests() {
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { getAppDir } = require('../src/utils/app-path-manager');
    const { getMetadata, setMetadata } = require('../src/server/services/session-metadata');
    const { getAlias } = require('../src/server/services/alias');

    const appDir = getAppDir();
    ensureDir(appDir);

    const sessionId = 'session-123';
    const saved = setMetadata(sessionId, { title: '测试标题', tags: ['feature', 'auth'] });
    assert.ok(saved && saved.metadata);
    assert.strictEqual(saved.metadata.title, '测试标题');
    assert.deepStrictEqual(saved.metadata.tags, ['feature', 'auth']);

    const loaded = getMetadata(sessionId);
    assert.strictEqual(loaded.title, '测试标题');
    assert.deepStrictEqual(loaded.tags, ['feature', 'auth']);
    assert.strictEqual(getAlias(sessionId), '测试标题');

    const cleared = setMetadata(sessionId, {});
    assert.ok(cleared);
    assert.strictEqual(cleared.metadata, null);
    assert.strictEqual(getMetadata(sessionId), null);
    assert.strictEqual(getAlias(sessionId), null);
  });

  console.log('AI metadata tests passed');
}

runMetadataTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
