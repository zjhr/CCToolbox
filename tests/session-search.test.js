const assert = require('assert');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * 在临时目录中构造最小可运行的 session 数据，避免污染真实环境。
 * @param {(ctx: { tempRoot: string, config: { projectsDir: string }, projectName: string, sessionId: string }) => Promise<void>} run
 */
async function withTempProject(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-session-search-red-'));
  const projectsDir = path.join(tempRoot, 'projects');
  const projectName = 'demo-project';
  const sessionId = 'session-search-red';
  const originalDisableWatcher = process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER;

  process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER = '1';

  try {
    const projectDir = path.join(projectsDir, projectName);
    fs.mkdirSync(projectDir, { recursive: true });

    const sessionFilePath = path.join(projectDir, `${sessionId}.jsonl`);
    const lines = [
      JSON.stringify({
        message: {
          role: 'user',
          content: '第一条用户消息，包含关键字：会话搜索'
        }
      }),
      JSON.stringify({
        message: {
          role: 'assistant',
          content: '第二条助手消息，也包含关键字：会话搜索'
        }
      })
    ];
    fs.writeFileSync(sessionFilePath, `${lines.join('\n')}\n`, 'utf8');

    await run({
      tempRoot,
      config: { projectsDir },
      projectName,
      sessionId
    });
  } finally {
    if (originalDisableWatcher === undefined) {
      delete process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER;
    } else {
      process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER = originalDisableWatcher;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * 启动仅挂载 sessions 路由的测试服务。
 * @param {{ projectsDir: string }} config
 * @returns {Promise<{ server: import('http').Server, port: number }>}
 */
async function startServer(config) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/sessions', require('../src/server/api/sessions')(config));

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function runTests() {
  await withTempProject(async ({ config, projectName, sessionId }) => {
    const { server, port } = await startServer(config);

    try {
      const keyword = '会话搜索';
      const response = await fetch(
        `http://127.0.0.1:${port}/api/sessions/${projectName}/${sessionId}/search?keyword=${encodeURIComponent(keyword)}`
      );

      assert.strictEqual(
        response.status,
        200,
        '单 session 消息搜索 API 应返回 200（当前 Red 阶段预期失败）'
      );

      const payload = await response.json();
      assert.ok(payload && Array.isArray(payload.matches), '响应应包含 matches 数组');
      assert.ok(payload.matches.length > 0, '至少应返回一个匹配项');

      const firstMatch = payload.matches[0];
      assert.strictEqual(typeof firstMatch.messageIndex, 'number', '匹配项应包含 messageIndex:number');
      assert.strictEqual(typeof firstMatch.context, 'string', '匹配项应包含 context:string');
      assert.strictEqual(typeof firstMatch.role, 'string', '匹配项应包含 role:string');
    } finally {
      server.close();
    }
  });

  console.log('Session search RED tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
