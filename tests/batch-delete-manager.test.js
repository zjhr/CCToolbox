const assert = require('assert');
const express = require('express');
const fs = require('fs');
const http = require('http');
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

function writeSession(filePath, text = 'hello') {
  ensureDir(path.dirname(filePath));
  const line = JSON.stringify({ type: 'user', message: { content: text } });
  fs.writeFileSync(filePath, `${line}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function block(ms) {
  const endAt = Date.now() + ms;
  while (Date.now() < endAt) {
    // 模拟同步阻塞
  }
}

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-batch-delete-test-'));
  try {
    return await run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

function clearTrashModules() {
  delete require.cache[require.resolve('../src/server/services/trash')];
  delete require.cache[require.resolve('../src/server/api/trash')];
}

function waitForComplete(manager, taskId, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for batch task complete event'));
    }, timeoutMs);

    const onComplete = (payload) => {
      if (payload.taskId !== taskId) return;
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timer);
      manager.off('complete', onComplete);
    };

    manager.on('complete', onComplete);
  });
}

function consumeSseBuffer(buffer, onEvent) {
  let pending = buffer;
  let delimiterIndex = pending.indexOf('\n\n');

  while (delimiterIndex >= 0) {
    const rawEvent = pending.slice(0, delimiterIndex);
    pending = pending.slice(delimiterIndex + 2);

    const event = {
      id: null,
      event: 'message',
      data: ''
    };

    rawEvent.split('\n').forEach((line) => {
      const normalized = line.replace(/\r$/, '');
      if (!normalized || normalized.startsWith(':')) return;

      const separator = normalized.indexOf(':');
      const field = separator >= 0 ? normalized.slice(0, separator) : normalized;
      const value = separator >= 0 ? normalized.slice(separator + 1).trimStart() : '';

      if (field === 'id') {
        event.id = Number.parseInt(value, 10);
      } else if (field === 'event') {
        event.event = value;
      } else if (field === 'data') {
        event.data = event.data ? `${event.data}\n${value}` : value;
      }
    });

    if (event.data) {
      try {
        event.data = JSON.parse(event.data);
      } catch (err) {
        // 保持字符串原样
      }
    }

    onEvent(event);
    delimiterIndex = pending.indexOf('\n\n');
  }

  return pending;
}

function requestJson(port, method, requestPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {}),
        ...headers
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function captureFirstProgressEvent(port, taskId) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = '';

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/api/trash/delete-progress?taskId=${encodeURIComponent(taskId)}`,
      method: 'GET',
      headers: {
        Accept: 'text/event-stream'
      }
    }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer = consumeSseBuffer(buffer + chunk, (event) => {
          if (!settled && event.event === 'progress') {
            settled = true;
            resolve(event);
            req.destroy();
          }
        });
      });
      res.on('end', () => {
        if (!settled) {
          reject(new Error('No progress event received'));
        }
      });
    });

    req.on('error', (err) => {
      if (settled && err.code === 'ECONNRESET') {
        return;
      }
      if (!settled) {
        reject(err);
      }
    });
    req.end();
  });
}

function collectSseEvents(port, taskId, headers = {}) {
  return new Promise((resolve, reject) => {
    const events = [];
    let settled = false;
    let buffer = '';

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/api/trash/delete-progress?taskId=${encodeURIComponent(taskId)}`,
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...headers
      }
    }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer = consumeSseBuffer(buffer + chunk, (event) => {
          events.push(event);
          if (event.event === 'complete' && !settled) {
            settled = true;
            resolve(events);
            req.destroy();
          }
        });
      });
      res.on('end', () => {
        if (!settled) {
          settled = true;
          resolve(events);
        }
      });
    });

    req.on('error', (err) => {
      if (settled && err.code === 'ECONNRESET') {
        return;
      }
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    req.end();
  });
}

async function runTests() {
  // 1) BatchDeleteManager 并发控制 + 进度事件
  {
    clearTrashModules();
    const { BatchDeleteManager } = require('../src/server/services/trash');
    let running = 0;
    let maxRunning = 0;

    const manager = new BatchDeleteManager({
      concurrency: 3,
      timeoutMs: 500,
      moveToTrashFn: async (config, projectName, sessionId) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await sleep(30);
        running -= 1;
        return { success: true, trashId: `trash-${projectName}-${sessionId}` };
      }
    });

    const task = manager.createTask({
      config: {},
      projectName: 'demo',
      channel: 'claude',
      sessionIds: ['a', 'b', 'c', 'd', 'e']
    });

    const complete = await waitForComplete(manager, task.taskId);
    assert.strictEqual(complete.status, 'completed');
    assert.strictEqual(complete.completed, 5);
    assert.strictEqual(complete.total, 5);
    assert.strictEqual(complete.errors.length, 0);
    assert.ok(maxRunning <= 3);
  }

  // 2) 超时保护
  {
    clearTrashModules();
    const { BatchDeleteManager } = require('../src/server/services/trash');
    const manager = new BatchDeleteManager({
      concurrency: 2,
      timeoutMs: 40,
      moveToTrashFn: async (config, projectName, sessionId) => {
        if (sessionId === 'slow') {
          await sleep(120);
        } else {
          await sleep(10);
        }
        return { success: true, trashId: `trash-${sessionId}` };
      }
    });

    const task = manager.createTask({
      config: {},
      projectName: 'demo',
      channel: 'claude',
      sessionIds: ['fast', 'slow']
    });

    const complete = await waitForComplete(manager, task.taskId);
    assert.strictEqual(complete.status, 'failed');
    assert.strictEqual(complete.completed, 2);
    assert.strictEqual(complete.total, 2);
    assert.ok(complete.errors.some(item => item.sessionId === 'slow'));
  }

  // 2.1) 同步阻塞场景也应被超时判定兜底捕获
  {
    clearTrashModules();
    const { BatchDeleteManager } = require('../src/server/services/trash');
    const manager = new BatchDeleteManager({
      concurrency: 1,
      timeoutMs: 40,
      moveToTrashFn: async () => {
        block(140);
        return { success: true, trashId: 'trash-blocking' };
      }
    });

    const task = manager.createTask({
      config: {},
      projectName: 'demo',
      channel: 'claude',
      sessionIds: ['blocking']
    });

    const complete = await waitForComplete(manager, task.taskId);
    assert.strictEqual(complete.status, 'failed');
    assert.strictEqual(complete.completed, 1);
    assert.ok(complete.errors.some(item => item.sessionId === 'blocking'));
    assert.ok(complete.errors.some(item => /timeout/i.test(item.error)));
  }

  // 3) SSE 流式推送 + Last-Event-ID 断线重连
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    clearTrashModules();
    const trashRouterFactory = require('../src/server/api/trash');

    const config = {
      projectsDir: path.join(tempRoot, 'projects')
    };
    const projectName = 'sse-project';
    const projectDir = path.join(config.projectsDir, projectName);
    ensureDir(projectDir);
    writeSession(path.join(projectDir, 's-1.jsonl'), 'message-1');
    writeSession(path.join(projectDir, 's-2.jsonl'), 'message-2');
    writeSession(path.join(projectDir, 's-3.jsonl'), 'message-3');

    const app = express();
    app.use(express.json());
    app.use('/api/trash', trashRouterFactory(config));

    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;

    try {
      const batchResponse = await requestJson(
        port,
        'POST',
        `/api/trash/claude/sessions/${projectName}/batch-delete`,
        { sessionIds: ['s-1', 's-2', 's-3'] }
      );
      assert.strictEqual(batchResponse.statusCode, 202);
      assert.ok(batchResponse.data.taskId);
      assert.strictEqual(batchResponse.data.totalCount, 3);

      const firstProgressEvent = await captureFirstProgressEvent(port, batchResponse.data.taskId);
      assert.strictEqual(firstProgressEvent.event, 'progress');
      assert.ok(Number.isFinite(firstProgressEvent.id));

      const eventsAfterReconnect = await collectSseEvents(
        port,
        batchResponse.data.taskId,
        { 'Last-Event-ID': String(firstProgressEvent.id) }
      );

      assert.ok(eventsAfterReconnect.length > 0);
      assert.ok(eventsAfterReconnect.every(event => event.id > firstProgressEvent.id));
      assert.ok(eventsAfterReconnect.some(event => event.event === 'complete'));
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  console.log('Batch delete manager tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
