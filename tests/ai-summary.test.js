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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-ai-summary-test-'));
  try {
    return await run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

async function runSummaryTests() {
  await withTempDir(async (tempRoot) => {
    const { loadSummary, saveSummary } = require('../src/server/services/session-summary');

    const sessionId = 'session-456';
    const sessionDir = path.join(tempRoot, 'sessions');
    ensureDir(sessionDir);
    const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`);
    fs.writeFileSync(sessionFile, '{"type":"user","message":{"content":"hello"}}\n', 'utf8');

    const saved = saveSummary(sessionFile, sessionId, '## 总结\n- 示例内容', 'ollama/qwen');
    assert.strictEqual(saved.sessionId, sessionId);
    assert.strictEqual(saved.summary.includes('示例内容'), true);
    assert.strictEqual(saved.modelUsed, 'ollama/qwen');

    const loaded = loadSummary(sessionFile, sessionId);
    assert.strictEqual(loaded.sessionId, sessionId);
    assert.strictEqual(loaded.summary.includes('示例内容'), true);
    assert.strictEqual(loaded.modelUsed, 'ollama/qwen');
  });

  console.log('AI summary tests passed');
}

runSummaryTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
