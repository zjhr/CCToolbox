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

function writeSession(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resetSessionsModule() {
  const modulePath = require.resolve('../src/server/services/sessions');
  delete require.cache[modulePath];
  return require('../src/server/services/sessions');
}

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-session-cache-test-'));
  try {
    return await run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

async function runTests() {
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    const {
      SessionListCache,
      getRecentSessionsOptimized
    } = resetSessionsModule();

    // 1) LRU 淘汰
    const lruCache = new SessionListCache({ maxEntries: 2, ttlMs: 1000 });
    lruCache.set('a', 1);
    lruCache.set('b', 2);
    assert.strictEqual(lruCache.get('a'), 1);
    lruCache.set('c', 3);
    assert.strictEqual(lruCache.get('b'), null);
    assert.strictEqual(lruCache.get('a'), 1);
    assert.strictEqual(lruCache.get('c'), 3);

    // 2) TTL 过期
    const ttlCache = new SessionListCache({ maxEntries: 2, ttlMs: 40 });
    ttlCache.set('x', 'value');
    assert.strictEqual(ttlCache.get('x'), 'value');
    await sleep(60);
    assert.strictEqual(ttlCache.get('x'), null);

    // 3) 模式匹配失效
    const invalidationCache = new SessionListCache({ maxEntries: 10, ttlMs: 1000 });
    invalidationCache.set('claude:5', []);
    invalidationCache.set('claude:10', []);
    invalidationCache.set('codex:5', []);
    const removed = invalidationCache.invalidate('claude:*');
    assert.strictEqual(removed, 2);
    assert.strictEqual(invalidationCache.get('claude:5'), null);
    assert.strictEqual(invalidationCache.get('claude:10'), null);
    assert.deepStrictEqual(invalidationCache.get('codex:5'), []);

    // 4) getRecentSessionsOptimized: 早期截取 + 跨项目并行扫描 + 元数据解析
    const projectsDir = path.join(tempRoot, 'projects');
    const projectA = path.join(projectsDir, 'project-a');
    const projectB = path.join(projectsDir, 'project-b');
    ensureDir(projectA);
    ensureDir(projectB);

    const now = Date.now();
    const oldPath = path.join(projectA, 'old-session.jsonl');
    const midPath = path.join(projectA, 'mid-session.jsonl');
    const newPath = path.join(projectB, 'new-session.jsonl');

    writeSession(oldPath, `${JSON.stringify({ type: 'user', message: { content: 'old message' } })}\n`);
    writeSession(midPath, `${JSON.stringify({ type: 'user', message: { content: 'mid message' } })}\n`);
    writeSession(newPath, `${JSON.stringify({ type: 'user', message: { content: 'new message' } })}\n`);
    writeSession(path.join(projectB, 'agent-debug.jsonl'), `${JSON.stringify({ type: 'user', message: { content: 'skip me' } })}\n`);

    fs.utimesSync(oldPath, new Date(now - 3000), new Date(now - 3000));
    fs.utimesSync(midPath, new Date(now - 1500), new Date(now - 1500));
    fs.utimesSync(newPath, new Date(now - 500), new Date(now - 500));

    const config = { projectsDir };
    const sessions = await getRecentSessionsOptimized(config, 2);

    assert.strictEqual(sessions.length, 2);
    assert.strictEqual(sessions[0].sessionId, 'new-session');
    assert.strictEqual(sessions[1].sessionId, 'mid-session');
    assert.strictEqual(sessions[0].firstMessage, 'new message');
    assert.strictEqual(sessions[1].firstMessage, 'mid message');
    assert.ok(sessions[0].projectName);
    assert.ok(sessions[0].projectDisplayName);

    // 5) 最新文件没有真实消息时，仍应补位返回满 limit 条
    const noMessagePath = path.join(projectB, 'no-message-session.jsonl');
    writeSession(noMessagePath, `${JSON.stringify({ type: 'system', message: { content: 'heartbeat' } })}\n`);
    fs.utimesSync(noMessagePath, new Date(now - 100), new Date(now - 100));

    const sessionsWithNoMessage = await getRecentSessionsOptimized(config, 2);
    assert.strictEqual(sessionsWithNoMessage.length, 2);
    assert.strictEqual(sessionsWithNoMessage[0].sessionId, 'new-session');
    assert.strictEqual(sessionsWithNoMessage[1].sessionId, 'mid-session');
    assert.ok(!sessionsWithNoMessage.some(item => item.sessionId === 'no-message-session'));
  });

  console.log('Session list cache tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
