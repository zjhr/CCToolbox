const assert = require('assert');
const fs = require('fs');

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath)];
  } catch (error) {
    // ignore
  }
}

function withMockedFsWatch(run) {
  const originalWatchFile = fs.watchFile;
  const originalUnwatchFile = fs.unwatchFile;
  const watchCalls = [];
  const unwatchCalls = [];

  fs.watchFile = (...args) => {
    watchCalls.push(args);
  };
  fs.unwatchFile = (...args) => {
    unwatchCalls.push(args);
  };

  try {
    return run({ watchCalls, unwatchCalls });
  } finally {
    fs.watchFile = originalWatchFile;
    fs.unwatchFile = originalUnwatchFile;
    clearModule('../src/server/services/sessions');
  }
}

function runTestCase(name, run, failures) {
  try {
    run();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

function runTests() {
  const failures = [];

  runTestCase(
    'sessions 服务应导出 watchSession/unwatchSession 接口',
    () => {
      clearModule('../src/server/services/sessions');
      const sessionsService = require('../src/server/services/sessions');

      assert.strictEqual(typeof sessionsService.watchSession, 'function');
      assert.strictEqual(typeof sessionsService.unwatchSession, 'function');
    },
    failures
  );

  runTestCase(
    '调用 watchSession(sessionId) 时应监听对应 JSONL 文件',
    () => withMockedFsWatch(({ watchCalls }) => {
      const sessionsService = require('../src/server/services/sessions');
      const sessionId = 'session-watch-red';

      sessionsService.watchSession(sessionId);

      assert.strictEqual(watchCalls.length, 1);
      const watchedPath = String(watchCalls[0][0] || '');
      assert.ok(watchedPath.includes(`${sessionId}.jsonl`));
    }),
    failures
  );

  runTestCase(
    '调用 unwatchSession(sessionId) 时应停止监听对应 JSONL 文件',
    () => withMockedFsWatch(({ unwatchCalls }) => {
      const sessionsService = require('../src/server/services/sessions');
      const sessionId = 'session-unwatch-red';

      sessionsService.unwatchSession(sessionId);

      assert.strictEqual(unwatchCalls.length, 1);
      const unwatchedPath = String(unwatchCalls[0][0] || '');
      assert.ok(unwatchedPath.includes(`${sessionId}.jsonl`));
    }),
    failures
  );

  runTestCase(
    'WebSocket 应支持 session 订阅广播并发送标准增量消息格式',
    () => {
      clearModule('../src/server/websocket-server');
      const websocketServer = require('../src/server/websocket-server');
      const sessionId = 'session-ws-red';
      const messages = [
        { id: 'm-1', type: 'assistant', content: 'hello' },
        { id: 'm-2', type: 'user', content: 'world' }
      ];

      assert.strictEqual(typeof websocketServer.subscribeSession, 'function');
      assert.strictEqual(typeof websocketServer.unsubscribeSession, 'function');
      assert.strictEqual(typeof websocketServer.broadcastSessionUpdate, 'function');

      const client1Payloads = [];
      const client2Payloads = [];
      const client1 = {
        readyState: 1,
        send(data) {
          client1Payloads.push(JSON.parse(data));
        }
      };
      const client2 = {
        readyState: 1,
        send(data) {
          client2Payloads.push(JSON.parse(data));
        }
      };

      websocketServer.subscribeSession(sessionId, client1);
      websocketServer.subscribeSession(sessionId, client2);
      websocketServer.broadcastSessionUpdate(sessionId, messages);

      assert.strictEqual(client1Payloads.length, 1);
      assert.strictEqual(client2Payloads.length, 1);
      assert.deepStrictEqual(client1Payloads[0], {
        type: 'session-update',
        sessionId,
        messages
      });
      assert.deepStrictEqual(client2Payloads[0], {
        type: 'session-update',
        sessionId,
        messages
      });
    },
    failures
  );

  runTestCase(
    '同一 session 的最后一个订阅者取消后应自动清理监听器',
    () => withMockedFsWatch(({ unwatchCalls }) => {
      const sessionsService = require('../src/server/services/sessions');
      const sessionId = 'session-cleanup-red';

      sessionsService.watchSession(sessionId);
      sessionsService.watchSession(sessionId);
      sessionsService.unwatchSession(sessionId);
      assert.strictEqual(unwatchCalls.length, 0);

      sessionsService.unwatchSession(sessionId);
      assert.strictEqual(unwatchCalls.length, 1);
      const unwatchedPath = String(unwatchCalls[0][0] || '');
      assert.ok(unwatchedPath.includes(`${sessionId}.jsonl`));
    }),
    failures
  );

  if (failures.length > 0) {
    const summary = failures
      .map((item, index) => `${index + 1}. ${item.name}: ${item.error.message}`)
      .join('\n');
    throw new Error(`Session realtime RED tests failed:\n${summary}`);
  }

  console.log('Session realtime RED tests passed');
}

runTests();
