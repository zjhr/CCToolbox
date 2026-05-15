const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================================
// 测试工具函数
// ============================================

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cache-test-'));
}

function removeTempDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function createSessionFile(dir, sessionId, timestamp, cwd) {
  const filePath = path.join(dir, `rollout-${timestamp}-${sessionId}.jsonl`);
  const meta = {
    type: 'session_meta',
    payload: {
      id: sessionId,
      timestamp: new Date().toISOString(),
      cwd: cwd || `/test/project-${sessionId}`,
      cli_version: '1.0.0',
      model_provider: 'openai'
    },
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(filePath, JSON.stringify(meta) + '\n', 'utf8');
  return filePath;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// 测试用例
// ============================================

async function runTests() {
  console.log('Starting Codex Session Cache Tests...\n');

  // 测试 1: getCachedProjects - 首次调用时扫描文件并缓存
  await testGetCachedProjectsFirstCall();

  // 测试 2: getCachedProjects - 30 秒内重复调用返回缓存
  await testGetCachedProjectsCacheHit();

  // 测试 3: getCachedProjects - 缓存过期后自动刷新
  await testGetCachedProjectsCacheExpiry();

  // 测试 4: getCachedSessions - 首次调用时扫描并缓存
  await testGetCachedSessionsFirstCall();

  // 测试 5: getCachedSessions - 30 秒内重复调用返回缓存
  await testGetCachedSessionsCacheHit();

  // 测试 6: onSessionDeleted - 从缓存移除会话
  await testOnSessionDeleted();

  // 测试 7: onSessionCreated - 添加会话到缓存
  await testOnSessionCreated();

  // 测试 8: 文件新增时自动添加到缓存
  await testFileWatcherAdd();

  // 测试 9: 文件删除时自动从缓存移除
  await testFileWatcherUnlink();

  // 测试 10: 文件大小应正确获取
  await testFileSizeCorrect();

  console.log('\n✅ All tests passed!');
}

// ============================================
// 测试 1: 首次调用时扫描文件并缓存
// ============================================

async function testGetCachedProjectsFirstCall() {
  console.log('Test 1: getCachedProjects - first call scans files and caches');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    // 设置环境变量
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    // 创建测试会话文件
    fs.mkdirSync(sessionsDir, { recursive: true });
    createSessionFile(sessionsDir, 'session-1', '2025-01-15T10-00-00', '/test/project-alpha');
    createSessionFile(sessionsDir, 'session-2', '2025-01-15T11-00-00', '/test/project-beta');

    // 清除模块缓存，确保使用新的缓存实例
    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedProjects, clearAllCache } = require('../src/server/services/codex-session-cache');

    // 清除缓存
    clearAllCache();

    // 首次调用
    const projects = getCachedProjects();

    // 验证
    assert.ok(Array.isArray(projects), 'Should return an array');
    assert.ok(projects.length >= 2, 'Should have at least 2 projects');

    // 验证项目名称
    const projectNames = projects.map(p => p.name);
    assert.ok(projectNames.includes('project-alpha'), 'Should include project-alpha');
    assert.ok(projectNames.includes('project-beta'), 'Should include project-beta');

    console.log('  ✓ First call scans files and returns projects');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 2: 30 秒内重复调用返回缓存
// ============================================

async function testGetCachedProjectsCacheHit() {
  console.log('Test 2: getCachedProjects - cache hit within 30 seconds');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    createSessionFile(sessionsDir, 'session-3', '2025-01-15T12-00-00', '/test/project-gamma');

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedProjects, clearAllCache } = require('../src/server/services/codex-session-cache');

    clearAllCache();

    // 首次调用
    const firstCall = getCachedProjects();

    // 立即再次调用
    const secondCall = getCachedProjects();

    // 验证返回的是同一个对象引用（缓存命中）
    assert.strictEqual(firstCall, secondCall, 'Should return same cached object');

    console.log('  ✓ Cache hit returns same object');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 3: 缓存过期后自动刷新
// ============================================

async function testGetCachedProjectsCacheExpiry() {
  console.log('Test 3: getCachedProjects - cache expiry triggers refresh');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    createSessionFile(sessionsDir, 'session-4', '2025-01-15T13-00-00', '/test/project-delta');

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedProjects, clearAllCache, setCacheTTL } = require('../src/server/services/codex-session-cache');

    // 设置 TTL 为 100ms（测试用）
    setCacheTTL(100);

    clearAllCache();

    // 首次调用
    const firstCall = getCachedProjects();

    // 等待缓存过期
    await sleep(150);

    // 再次调用，应该触发刷新
    const secondCall = getCachedProjects();

    // 验证返回的是不同的对象引用（缓存已刷新）
    assert.notStrictEqual(firstCall, secondCall, 'Should return new object after expiry');

    console.log('  ✓ Cache expiry triggers refresh');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 4: getCachedSessions - 首次调用时扫描并缓存
// ============================================

async function testGetCachedSessionsFirstCall() {
  console.log('Test 4: getCachedSessions - first call scans and caches');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    createSessionFile(sessionsDir, 'session-5', '2025-01-15T14-00-00', '/test/project-epsilon');
    createSessionFile(sessionsDir, 'session-6', '2025-01-15T15-00-00', '/test/project-epsilon');

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedSessions, clearAllCache } = require('../src/server/services/codex-session-cache');

    clearAllCache();

    // 首次调用
    const sessions = getCachedSessions('project-epsilon');

    // 验证
    assert.ok(Array.isArray(sessions), 'Should return an array');
    assert.strictEqual(sessions.length, 2, 'Should have 2 sessions');

    // 验证会话 ID
    const sessionIds = sessions.map(s => s.sessionId);
    assert.ok(sessionIds.includes('session-5'), 'Should include session-5');
    assert.ok(sessionIds.includes('session-6'), 'Should include session-6');

    console.log('  ✓ First call scans files and returns sessions');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 5: getCachedSessions - 30 秒内重复调用返回缓存
// ============================================

async function testGetCachedSessionsCacheHit() {
  console.log('Test 5: getCachedSessions - cache hit within 30 seconds');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    createSessionFile(sessionsDir, 'session-7', '2025-01-15T16-00-00', '/test/project-zeta');

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedSessions, clearAllCache } = require('../src/server/services/codex-session-cache');

    clearAllCache();

    // 首次调用
    const firstCall = getCachedSessions('project-zeta');

    // 立即再次调用
    const secondCall = getCachedSessions('project-zeta');

    // 验证返回的是同一个对象引用（缓存命中）
    assert.strictEqual(firstCall, secondCall, 'Should return same cached object');

    console.log('  ✓ Cache hit returns same object');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 6: onSessionDeleted - 从缓存移除会话
// ============================================

async function testOnSessionDeleted() {
  console.log('Test 6: onSessionDeleted - removes session from cache');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    createSessionFile(sessionsDir, 'session-8', '2025-01-15T17-00-00', '/test/project-eta');
    createSessionFile(sessionsDir, 'session-9', '2025-01-15T18-00-00', '/test/project-eta');

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedSessions, onSessionDeleted, clearAllCache } = require('../src/server/services/codex-session-cache');

    clearAllCache();

    // 首次调用，建立缓存
    const beforeDelete = getCachedSessions('project-eta');
    assert.strictEqual(beforeDelete.length, 2, 'Should have 2 sessions before delete');

    // 删除一个会话
    onSessionDeleted('session-8');

    // 再次获取，应该只有 1 个会话
    const afterDelete = getCachedSessions('project-eta');
    assert.strictEqual(afterDelete.length, 1, 'Should have 1 session after delete');
    assert.strictEqual(afterDelete[0].sessionId, 'session-9', 'Should have session-9 remaining');

    console.log('  ✓ Session removed from cache');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 7: onSessionCreated - 添加会话到缓存
// ============================================

async function testOnSessionCreated() {
  console.log('Test 7: onSessionCreated - adds session to cache');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    createSessionFile(sessionsDir, 'session-10', '2025-01-15T19-00-00', '/test/project-theta');

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedSessions, onSessionCreated, clearAllCache } = require('../src/server/services/codex-session-cache');

    clearAllCache();

    // 首次调用，建立缓存
    const beforeCreate = getCachedSessions('project-theta');
    assert.strictEqual(beforeCreate.length, 1, 'Should have 1 session before create');

    // 创建新会话
    const newSession = {
      sessionId: 'session-11',
      filePath: path.join(sessionsDir, 'rollout-2025-01-15T20-00-00-session-11.jsonl'),
      meta: {
        timestamp: '2025-01-15T20:00:00.000Z',
        cwd: '/test/project-theta'
      }
    };
    onSessionCreated(newSession);

    // 再次获取，应该有 2 个会话
    const afterCreate = getCachedSessions('project-theta');
    assert.strictEqual(afterCreate.length, 2, 'Should have 2 sessions after create');

    const sessionIds = afterCreate.map(s => s.sessionId);
    assert.ok(sessionIds.includes('session-11'), 'Should include new session');

    console.log('  ✓ Session added to cache');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 8: 文件新增时自动添加到缓存
// ============================================

async function testFileWatcherAdd() {
  console.log('Test 8: file watcher - auto add on new file');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    createSessionFile(sessionsDir, 'session-12', '2025-01-15T21-00-00', '/test/project-iota');

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedSessions, setupCodexFileWatcher, stopCodexFileWatcher, clearAllCache } = require('../src/server/services/codex-session-cache');

    clearAllCache();

    // 启动文件监听
    setupCodexFileWatcher();

    // 等待文件监听器初始化
    await sleep(1000);

    // 首次调用，建立缓存
    const beforeAdd = getCachedSessions('project-iota');
    assert.strictEqual(beforeAdd.length, 1, 'Should have 1 session before add');

    // 创建新文件
    createSessionFile(sessionsDir, 'session-13', '2025-01-15T22-00-00', '/test/project-iota');

    // 等待文件监听触发（chokidar 需要时间检测变化）
    await sleep(2000);

    // 再次获取，应该有 2 个会话
    const afterAdd = getCachedSessions('project-iota');
    assert.strictEqual(afterAdd.length, 2, 'Should have 2 sessions after file add');

    // 停止文件监听
    stopCodexFileWatcher();

    console.log('  ✓ File watcher auto adds new session');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 9: 文件删除时自动从缓存移除
// ============================================

async function testFileWatcherUnlink() {
  console.log('Test 9: file watcher - auto remove on file delete');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    const filePath1 = createSessionFile(sessionsDir, 'session-14', '2025-01-15T23-00-00', '/test/project-kappa');
    createSessionFile(sessionsDir, 'session-15', '2025-01-15T23-30-00', '/test/project-kappa');

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedSessions, setupCodexFileWatcher, stopCodexFileWatcher, clearAllCache } = require('../src/server/services/codex-session-cache');

    clearAllCache();

    // 启动文件监听
    setupCodexFileWatcher();

    // 等待文件监听器初始化
    await sleep(1000);

    // 首次调用，建立缓存
    const beforeDelete = getCachedSessions('project-kappa');
    assert.strictEqual(beforeDelete.length, 2, 'Should have 2 sessions before delete');

    // 删除文件
    fs.unlinkSync(filePath1);

    // 等待文件监听触发
    await sleep(2000);

    // 再次获取，应该只有 1 个会话
    const afterDelete = getCachedSessions('project-kappa');
    assert.strictEqual(afterDelete.length, 1, 'Should have 1 session after file delete');
    assert.strictEqual(afterDelete[0].sessionId, 'session-15', 'Should have session-15 remaining');

    // 停止文件监听
    stopCodexFileWatcher();

    console.log('  ✓ File watcher auto removes deleted session');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 测试 10: 文件大小应正确获取
// ============================================

async function testFileSizeCorrect() {
  console.log('Test 10: file size should be correctly retrieved');

  const tempDir = createTempDir();
  const sessionsDir = path.join(tempDir, 'sessions');

  try {
    process.env.CODEX_SESSIONS_DIR = sessionsDir;

    fs.mkdirSync(sessionsDir, { recursive: true });
    const filePath = createSessionFile(sessionsDir, 'session-16', '2025-01-16T00-00-00', '/test/project-lambda');

    // 获取文件真实大小
    const stats = fs.statSync(filePath);
    const expectedSize = stats.size;

    delete require.cache[require.resolve('../src/server/services/codex-session-cache')];
    const { getCachedSessions, clearAllCache } = require('../src/server/services/codex-session-cache');

    clearAllCache();

    // 获取缓存会话
    const sessions = getCachedSessions('project-lambda');

    // 验证文件大小
    assert.strictEqual(sessions.length, 1, 'Should have 1 session');
    assert.ok(sessions[0].size > 0, 'Size should be greater than 0');
    assert.strictEqual(sessions[0].size, expectedSize, `Size should be ${expectedSize}`);

    console.log('  ✓ File size correctly retrieved');
  } finally {
    delete process.env.CODEX_SESSIONS_DIR;
    removeTempDir(tempDir);
  }
}

// ============================================
// 运行测试
// ============================================

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
