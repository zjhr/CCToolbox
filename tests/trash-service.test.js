const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content = '') {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-trash-test-'));
  try {
    return await run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

async function runTrashTests() {
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { getAppDir } = require('../src/utils/app-path-manager');
    const { cleanupSessionRelations } = require('../src/server/services/sessions');
    const { setAlias, loadAliases } = require('../src/server/services/alias');

    const appDir = getAppDir();
    ensureDir(appDir);

    // 初始化别名与 fork 关系
    setAlias('session-1', 'alias-1');
    writeFile(path.join(appDir, 'fork-relations.json'), JSON.stringify({
      'child-1': 'session-1',
      'session-1': 'parent-1'
    }, null, 2));
    writeFile(path.join(appDir, 'session-order.json'), JSON.stringify({
      'project-a': ['session-1', 'session-2'],
      'codex-project': ['session-1']
    }, null, 2));

    cleanupSessionRelations('session-1');

    const aliases = loadAliases();
    assert.strictEqual(aliases['session-1'], undefined);

    const forkRelations = JSON.parse(fs.readFileSync(path.join(appDir, 'fork-relations.json'), 'utf8'));
    assert.strictEqual(forkRelations['session-1'], undefined);
    assert.strictEqual(forkRelations['child-1'], undefined);

    const orders = JSON.parse(fs.readFileSync(path.join(appDir, 'session-order.json'), 'utf8'));
    assert.deepStrictEqual(orders['project-a'], ['session-2']);
    assert.deepStrictEqual(orders['codex-project'], []);
  });

  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { moveToTrash, listTrash, restoreFromTrash } = require('../src/server/services/trash');

    const config = {
      projectsDir: path.join(tempRoot, 'projects')
    };

    const projectName = 'demo';
    const sessionId = 'session-1';
    const sessionDir = path.join(config.projectsDir, projectName);
    const sessionPath = path.join(sessionDir, `${sessionId}.jsonl`);
    const content = JSON.stringify({
      type: 'user',
      message: { content: 'hello' }
    }) + '\n';

    writeFile(sessionPath, content);

    const moveResult = await moveToTrash(config, projectName, sessionId, 'claude');
    assert.strictEqual(moveResult.success, true);
    assert.strictEqual(fs.existsSync(sessionPath), false);

    const trashData = await listTrash(projectName, 'claude');
    assert.strictEqual(trashData.items.length, 1);
    const trashId = trashData.items[0].trashId;

    const restoreResult = await restoreFromTrash(config, projectName, [trashId], 'claude');
    assert.strictEqual(restoreResult.restored, 1);
    assert.strictEqual(fs.existsSync(sessionPath), true);
  });

  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { moveToTrash, listTrash, restoreFromTrash } = require('../src/server/services/trash');
    const { setAlias, loadAliases } = require('../src/server/services/alias');

    const config = {
      projectsDir: path.join(tempRoot, 'projects')
    };

    const projectName = 'alias-conflict';
    const sessionId = 'session-1';
    const sessionDir = path.join(config.projectsDir, projectName);
    const sessionPath = path.join(sessionDir, `${sessionId}.jsonl`);
    const content = JSON.stringify({
      type: 'user',
      message: { content: 'hello' }
    }) + '\n';

    writeFile(sessionPath, content);
    setAlias(sessionId, 'dup-alias');
    await moveToTrash(config, projectName, sessionId, 'claude');

    const conflictId = 'session-2';
    writeFile(path.join(sessionDir, `${conflictId}.jsonl`), content);
    setAlias(conflictId, 'dup-alias');

    const trashData = await listTrash(projectName, 'claude');
    const conflictResult = await restoreFromTrash(
      config,
      projectName,
      [trashData.items[0].trashId],
      'claude'
    );
    assert.strictEqual(conflictResult.success, false);
    assert.strictEqual(conflictResult.conflicts.length, 1);

    const resolveResult = await restoreFromTrash(
      config,
      projectName,
      [trashData.items[0].trashId],
      'claude',
      { aliasStrategy: 'keep-existing' }
    );
    assert.strictEqual(resolveResult.restored, 1);

    const aliases = loadAliases();
    assert.strictEqual(aliases[sessionId], undefined);
    assert.strictEqual(aliases[conflictId], 'dup-alias');
  });

  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { moveToTrash, listTrash, restoreFromTrash } = require('../src/server/services/trash');

    const config = {
      projectsDir: path.join(tempRoot, 'projects')
    };

    const projectName = 'conflict-demo';
    const sessionId = 'session-1';
    const sessionDir = path.join(config.projectsDir, projectName);
    const sessionPath = path.join(sessionDir, `${sessionId}.jsonl`);
    const content = JSON.stringify({
      type: 'user',
      message: { content: 'hello' }
    }) + '\n';

    writeFile(sessionPath, content);
    const moveResult = await moveToTrash(config, projectName, sessionId, 'claude');
    assert.strictEqual(moveResult.success, true);

    // 创建冲突文件
    writeFile(sessionPath, content);

    const trashData = await listTrash(projectName, 'claude');
    const restoreResult = await restoreFromTrash(config, projectName, [trashData.items[0].trashId], 'claude');
    assert.strictEqual(restoreResult.restored, 1);

    const files = fs.readdirSync(sessionDir);
    const restoredFiles = files.filter(name => name.startsWith(`${sessionId}_restored`));
    assert.ok(restoredFiles.length > 0);
  });

  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { moveToTrash, listTrash, emptyTrash, cleanupExpiredTrash } = require('../src/server/services/trash');

    const config = {
      projectsDir: path.join(tempRoot, 'projects')
    };

    const projectName = 'cleanup-demo';
    const sessionDir = path.join(config.projectsDir, projectName);
    writeFile(path.join(sessionDir, 'session-1.jsonl'), '{"type":"user","message":{"content":"a"}}\n');
    writeFile(path.join(sessionDir, 'session-2.jsonl'), '{"type":"user","message":{"content":"b"}}\n');

    await moveToTrash(config, projectName, 'session-1', 'claude');
    await moveToTrash(config, projectName, 'session-2', 'claude');
    let trashData = await listTrash(projectName, 'claude');
    assert.strictEqual(trashData.items.length, 2);

    const emptyResult = await emptyTrash(projectName, 'claude');
    assert.strictEqual(emptyResult.deletedCount, 2);
    trashData = await listTrash(projectName, 'claude');
    assert.strictEqual(trashData.items.length, 0);

    writeFile(path.join(sessionDir, 'session-3.jsonl'), '{"type":"user","message":{"content":"c"}}\n');
    await moveToTrash(config, projectName, 'session-3', 'claude');
    const { getAppDir } = require('../src/utils/app-path-manager');
    const indexPath = path.join(getAppDir(), 'trash-index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    index.items = index.items.map(item => ({
      ...item,
      expiresAt: Date.now() - 1000
    }));
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
    await cleanupExpiredTrash();
    trashData = await listTrash(projectName, 'claude');
    assert.strictEqual(trashData.items.length, 0);
  });

  await withTempDir(async (tempRoot) => {
    const originalHome = process.env.HOME;
    process.env.HOME = tempRoot;
    process.env.CCTOOLBOX_HOME = tempRoot;

    const { moveToTrash, restoreFromTrash, getTrashMessages } = require('../src/server/services/trash');
    const config = {
      projectsDir: path.join(tempRoot, 'projects')
    };

    const codexDir = path.join(tempRoot, '.codex', 'sessions', '2025', '01', '01');
    ensureDir(codexDir);
    const codexSessionId = 'codex-1';
    const codexPath = path.join(codexDir, `rollout-2025-01-01T00-00-00-${codexSessionId}.jsonl`);
    const codexMeta = {
      type: 'session_meta',
      payload: {
        id: codexSessionId,
        timestamp: '2025-01-01T00:00:00Z',
        cwd: '/tmp/demo'
      }
    };
    const codexMsg = {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ text: 'hello' }]
      }
    };
    writeFile(codexPath, `${JSON.stringify(codexMeta)}\n${JSON.stringify(codexMsg)}\n`);

    const codexMove = await moveToTrash(config, 'demo', codexSessionId, 'codex');
    assert.strictEqual(codexMove.success, true);
    assert.strictEqual(fs.existsSync(codexPath), false);
    const codexMessages = await getTrashMessages('demo', codexMove.trashId, 'codex', { page: 1, limit: 10, order: 'desc' });
    assert.ok(codexMessages.messages.length > 0);
    await restoreFromTrash(config, 'demo', [codexMove.trashId], 'codex');
    assert.strictEqual(fs.existsSync(codexPath), true);

    const geminiProjectHash = 'a'.repeat(64);
    const geminiDir = path.join(tempRoot, '.gemini', 'tmp', geminiProjectHash, 'chats');
    ensureDir(geminiDir);
    const geminiSessionId = 'gemini-1';
    const geminiPath = path.join(geminiDir, 'session-2025-01-01T00-00-00-abcd.json');
    const geminiSession = {
      sessionId: geminiSessionId,
      projectHash: geminiProjectHash,
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      messages: [
        { type: 'user', content: 'hello', tokens: { total: 1 } },
        { type: 'model', content: 'hi' }
      ]
    };
    writeFile(geminiPath, JSON.stringify(geminiSession, null, 2));

    const geminiMove = await moveToTrash(config, geminiProjectHash, geminiSessionId, 'gemini');
    assert.strictEqual(geminiMove.success, true);
    assert.strictEqual(fs.existsSync(geminiPath), false);
    const geminiMessages = await getTrashMessages(geminiProjectHash, geminiMove.trashId, 'gemini', { page: 1, limit: 10, order: 'desc' });
    assert.ok(geminiMessages.messages.length > 0);
    await restoreFromTrash(config, geminiProjectHash, [geminiMove.trashId], 'gemini');
    assert.strictEqual(fs.existsSync(geminiPath), true);

    process.env.HOME = originalHome;
  });

  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { moveToTrash, listTrash, getTrashMessages } = require('../src/server/services/trash');
    const config = {
      projectsDir: path.join(tempRoot, 'projects')
    };

    const projectName = 'bulk-demo';
    const sessionDir = path.join(config.projectsDir, projectName);
    ensureDir(sessionDir);

    const sessionIds = [];
    for (let i = 1; i <= 120; i++) {
      const sessionId = `session-${i}`;
      sessionIds.push(sessionId);
      writeFile(path.join(sessionDir, `${sessionId}.jsonl`), '{"type":"user","message":{"content":"bulk"}}\n');
    }

    for (const sessionId of sessionIds) {
      const result = await moveToTrash(config, projectName, sessionId, 'claude');
      assert.strictEqual(result.success, true);
    }

    const trashData = await listTrash(projectName, 'claude');
    assert.strictEqual(trashData.items.length, sessionIds.length);

    const messages = await getTrashMessages(projectName, trashData.items[0].trashId, 'claude', {
      page: 1,
      limit: 5,
      order: 'desc'
    });
    assert.ok(messages.messages.length > 0);
  });

  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const { moveToTrash } = require('../src/server/services/trash');
    const config = {
      projectsDir: path.join(tempRoot, 'projects')
    };
    const projectName = 'concurrency-demo';
    const sessionDir = path.join(config.projectsDir, projectName);
    ensureDir(sessionDir);

    const sessionIds = ['c-1', 'c-2', 'c-3', 'c-4', 'c-5'];
    sessionIds.forEach(sessionId => {
      writeFile(path.join(sessionDir, `${sessionId}.jsonl`), '{"type":"user","message":{"content":"c"}}\n');
    });

    const results = await Promise.all(
      sessionIds.map(sessionId => moveToTrash(config, projectName, sessionId, 'claude'))
    );
    assert.strictEqual(results.filter(result => result.success).length, sessionIds.length);
  });
}

runTrashTests()
  .then(() => {
    console.log('trash-service tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
