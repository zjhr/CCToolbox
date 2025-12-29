const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content = 'test') {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-test-'));
  try {
    return run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

function runTests() {
  withTempDir((tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const manager = require('../../src/utils/app-path-manager');

    const claudeDir = path.join(tempRoot, '.claude');
    const oldDir = path.join(claudeDir, 'cc-tool');
    const newDir = path.join(claudeDir, 'cctoolbox');

    const appDir = manager.getAppDir();
    assert.strictEqual(appDir, newDir);
    assert.strictEqual(fs.existsSync(newDir), false);

    ensureDir(claudeDir);
    writeFile(path.join(oldDir, 'channels.json'), '{"channels": []}');
    writeFile(path.join(oldDir, 'sessions', 'a.json'), '{"id": "a"}');
    writeFile(path.join(oldDir, 'stats', 'statistics.json'), '{}');

    const result = manager.performMigration();
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(fs.existsSync(path.join(newDir, 'channels.json')), true);
    assert.strictEqual(
      fs.existsSync(path.join(newDir, '.migration-complete')),
      true
    );
    assert.strictEqual(manager.verifyMigration(oldDir, newDir), true);
  });

  withTempDir((tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const manager = require('../../src/utils/app-path-manager');

    const claudeDir = path.join(tempRoot, '.claude');
    const oldDir = path.join(claudeDir, 'cc-tool');
    const newDir = path.join(claudeDir, 'cctoolbox');

    ensureDir(claudeDir);
    writeFile(path.join(oldDir, 'channels.json'), '{"channels": []}');

    const appDir = manager.getAppDir();
    assert.strictEqual(appDir, oldDir);

    const result = manager.migrateIfNeeded();
    assert.ok(['completed', 'already-migrated'].includes(result.status));
    assert.strictEqual(
      fs.existsSync(path.join(newDir, '.migration-complete')),
      true
    );
  });

  withTempDir((tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const manager = require('../../src/utils/app-path-manager');

    const claudeDir = path.join(tempRoot, '.claude');
    const oldDir = path.join(claudeDir, 'cc-tool');
    const newDir = path.join(claudeDir, 'cctoolbox');

    ensureDir(claudeDir);
    writeFile(path.join(oldDir, 'channels.json'), '{"channels": []}');

    writeFile(newDir, 'not-a-directory');
    const result = manager.performMigration();
    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(fs.existsSync(newDir), false);
    assert.strictEqual(fs.existsSync(oldDir), true);
  });
}

try {
  runTests();
  console.log('app-path-manager tests passed');
} catch (error) {
  console.error(error);
  process.exit(1);
}
