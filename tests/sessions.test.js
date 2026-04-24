const assert = require('assert');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-sessions-api-test-'));
  try {
    return await run(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath)];
  } catch (error) {
    // ignore
  }
}

async function startServer(config) {
  clearModule('../src/server/api/sessions');
  clearModule('../src/server/services/cache-watcher');
  clearModule('../src/server/services/sessions');

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/sessions', require('../src/server/api/sessions')(config));

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({
        server,
        port: server.address().port
      });
    });
  });
}

function createSessionLine(content) {
  return `${JSON.stringify({ type: 'user', message: { content } })}\n`;
}

function assertSessionsContainAbsoluteFilePath(sessions, sourceLabel) {
  assert.ok(Array.isArray(sessions), `${sourceLabel} 应返回 sessions 数组`);
  assert.ok(sessions.length > 0, `${sourceLabel} 应至少返回一条 session`);

  sessions.forEach((session) => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(session, 'filePath'),
      `${sourceLabel} 的 session ${session.sessionId || 'unknown'} 缺少 filePath 字段`
    );
    assert.strictEqual(
      typeof session.filePath,
      'string',
      `${sourceLabel} 的 session ${session.sessionId || 'unknown'} filePath 必须是字符串`
    );
    assert.ok(
      path.isAbsolute(session.filePath),
      `${sourceLabel} 的 session ${session.sessionId || 'unknown'} filePath 必须是绝对路径，当前值：${session.filePath}`
    );
  });
}

async function runTests() {
  await withTempDir(async (tempRoot) => {
    const originalDisableWatcher = process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER;
    process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER = '1';

    try {
      const absoluteProjectsDir = path.join(tempRoot, 'projects');
      const relativeProjectsDir = path.relative(process.cwd(), absoluteProjectsDir);
      const projectName = 'demo-project';
      const projectDir = path.join(absoluteProjectsDir, projectName);

      ensureDir(projectDir);
      fs.writeFileSync(
        path.join(projectDir, 'session-red.jsonl'),
        createSessionLine('session list api red test'),
        'utf8'
      );

      const { server, port } = await startServer({ projectsDir: relativeProjectsDir });

      try {
        const projectListRes = await fetch(`http://127.0.0.1:${port}/api/sessions/${projectName}`);
        assert.strictEqual(projectListRes.status, 200, '项目会话列表接口应返回 200');
        const projectListJson = await projectListRes.json();
        assertSessionsContainAbsoluteFilePath(projectListJson.sessions, '/api/sessions/:projectName');

        const recentListRes = await fetch(`http://127.0.0.1:${port}/api/sessions/recent/list?limit=5`);
        assert.strictEqual(recentListRes.status, 200, '最近会话列表接口应返回 200');
        const recentListJson = await recentListRes.json();
        assertSessionsContainAbsoluteFilePath(recentListJson.sessions, '/api/sessions/recent/list');
      } finally {
        server.close();
      }
    } finally {
      if (originalDisableWatcher === undefined) {
        delete process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER;
      } else {
        process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER = originalDisableWatcher;
      }
    }
  });

  console.log('Sessions API filePath tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
