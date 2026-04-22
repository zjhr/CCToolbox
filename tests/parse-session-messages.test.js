const assert = require('assert');
const fs = require('fs');

const sessionsService = require('../src/server/services/sessions');

function buildResponseItem({ id, role, content }) {
  return JSON.stringify({
    type: 'response_item',
    id,
    timestamp: '2026-04-22T00:00:00.000Z',
    payload: {
      type: 'message',
      id: `${id}-payload`,
      role,
      content
    }
  });
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

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath)];
  } catch (error) {
    // ignore
  }
}

function runGeminiWatchSessionUpdateTest({ sessionId, initialMessages, updatedMessages }) {
  const sessionsModulePath = '../src/server/services/sessions';
  const geminiSessionsModulePath = '../src/server/services/gemini-sessions';
  const websocketModulePath = '../src/server/websocket-server';
  const mockedFilePath = `/tmp/${sessionId}.json`;
  const snapshots = [
    JSON.stringify({ messages: initialMessages }),
    JSON.stringify({ messages: updatedMessages })
  ];
  let readIndex = 0;
  let capturedListener = null;
  const broadcastCalls = [];

  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;
  const originalWatchFile = fs.watchFile;
  const originalUnwatchFile = fs.unwatchFile;

  const geminiSessionsResolvedPath = require.resolve(geminiSessionsModulePath);
  const websocketResolvedPath = require.resolve(websocketModulePath);
  const originalGeminiSessionsCache = require.cache[geminiSessionsResolvedPath];
  const originalWebsocketCache = require.cache[websocketResolvedPath];

  clearModule(sessionsModulePath);
  require.cache[geminiSessionsResolvedPath] = {
    id: geminiSessionsResolvedPath,
    filename: geminiSessionsResolvedPath,
    loaded: true,
    exports: {
      getSessionById: (targetSessionId) => ({
        sessionId: targetSessionId,
        filePath: mockedFilePath
      })
    }
  };
  require.cache[websocketResolvedPath] = {
    id: websocketResolvedPath,
    filename: websocketResolvedPath,
    loaded: true,
    exports: {
      broadcastSessionUpdate: (targetSessionId, messages) => {
        broadcastCalls.push({ sessionId: targetSessionId, messages });
      }
    }
  };

  fs.existsSync = (targetPath) => {
    if (targetPath === mockedFilePath) {
      return true;
    }
    return originalExistsSync(targetPath);
  };
  fs.readFileSync = (targetPath, ...args) => {
    if (targetPath === mockedFilePath) {
      const index = Math.min(readIndex, snapshots.length - 1);
      readIndex += 1;
      return snapshots[index];
    }
    return originalReadFileSync(targetPath, ...args);
  };
  fs.watchFile = (targetPath, options, listener) => {
    capturedListener = listener;
  };
  fs.unwatchFile = () => {};

  try {
    const isolatedSessionsService = require(sessionsModulePath);
    isolatedSessionsService.watchSession(sessionId, { channel: 'gemini' });
    assert.strictEqual(typeof capturedListener, 'function');
    capturedListener();
    isolatedSessionsService.unwatchSession(sessionId, { channel: 'gemini' });
    return broadcastCalls;
  } finally {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    fs.watchFile = originalWatchFile;
    fs.unwatchFile = originalUnwatchFile;
    clearModule(sessionsModulePath);

    if (originalGeminiSessionsCache) {
      require.cache[geminiSessionsResolvedPath] = originalGeminiSessionsCache;
    } else {
      delete require.cache[geminiSessionsResolvedPath];
    }

    if (originalWebsocketCache) {
      require.cache[websocketResolvedPath] = originalWebsocketCache;
    } else {
      delete require.cache[websocketResolvedPath];
    }
  }
}

function runTests() {
  const failures = [];

  runTestCase(
    'parseSessionUpdateMessages: tool_result 内容应被保留并正确格式化',
    () => {
      const chunk = [
        buildResponseItem({
          id: 'user-text',
          role: 'user',
          content: [{ type: 'text', text: '普通用户文本' }]
        }),
        buildResponseItem({
          id: 'user-tool-result',
          role: 'user',
          content: [{ type: 'tool_result', name: 'fetchProfile', content: { ok: true, code: 0 } }]
        })
      ].join('\n');

      const messages = sessionsService.parseSessionUpdateMessages(chunk);
      assert.strictEqual(messages.length, 2);
      assert.strictEqual(messages[0].id, 'user-text');
      assert.strictEqual(messages[0].type, 'user');
      assert.strictEqual(messages[0].content, '普通用户文本');
      assert.strictEqual(messages[1].id, 'user-tool-result');
      assert.strictEqual(messages[1].type, 'user');
      assert.ok(messages[1].content.includes('**[工具结果: fetchProfile]**'));
      assert.ok(messages[1].content.includes('"ok": true'));
      assert.ok(messages[1].content.includes('"code": 0'));
    },
    failures
  );

  runTestCase(
    'parseSessionUpdateMessages: tool_use 内容应被保留并正确格式化',
    () => {
      const chunk = [
        buildResponseItem({
          id: 'assistant-text',
          role: 'assistant',
          content: [{ type: 'text', text: '普通助手文本' }]
        }),
        buildResponseItem({
          id: 'assistant-tool-use',
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'shell', input: { cmd: 'echo hi' } }]
        })
      ].join('\n');

      const messages = sessionsService.parseSessionUpdateMessages(chunk);
      assert.strictEqual(messages.length, 2);
      assert.strictEqual(messages[0].id, 'assistant-text');
      assert.strictEqual(messages[0].type, 'assistant');
      assert.strictEqual(messages[0].content, '普通助手文本');
      assert.strictEqual(messages[1].id, 'assistant-tool-use');
      assert.strictEqual(messages[1].type, 'assistant');
      assert.ok(messages[1].content.includes('**[调用工具: shell]**'));
      assert.ok(messages[1].content.includes('"cmd": "echo hi"'));
    },
    failures
  );

  runTestCase(
    'parseSessionUpdateMessages: thinking 内容应被保留并正确格式化',
    () => {
      const chunk = [
        buildResponseItem({
          id: 'assistant-text-2',
          role: 'assistant',
          content: [{ type: 'text', text: '另一条助手文本' }]
        }),
        buildResponseItem({
          id: 'assistant-thinking',
          role: 'assistant',
          content: [{ type: 'thinking', thinking: '内部思考内容' }]
        })
      ].join('\n');

      const messages = sessionsService.parseSessionUpdateMessages(chunk);
      assert.strictEqual(messages.length, 2);
      assert.strictEqual(messages[0].id, 'assistant-text-2');
      assert.strictEqual(messages[0].type, 'assistant');
      assert.strictEqual(messages[0].content, '另一条助手文本');
      assert.strictEqual(messages[1].id, 'assistant-thinking');
      assert.strictEqual(messages[1].type, 'assistant');
      assert.strictEqual(messages[1].content, '**[思考]**\n内部思考内容');
    },
    failures
  );

  runTestCase(
    'watchSession(gemini): functionResponse(tool_result) 内容应被保留并触发广播',
    () => {
      const broadcastCalls = runGeminiWatchSessionUpdateTest({
        sessionId: 'gemini-watch-tool-result-red',
        initialMessages: [],
        updatedMessages: [
          {
            id: 'gemini-tool-result',
            type: 'model',
            content: [
              {
                functionResponse: {
                  name: 'read_file',
                  response: { content: 'ok' }
                }
              }
            ],
            timestamp: '2026-04-22T00:00:00.000Z'
          }
        ]
      });

      assert.strictEqual(broadcastCalls.length, 1);
      assert.strictEqual(broadcastCalls[0].sessionId, 'gemini-watch-tool-result-red');
      assert.strictEqual(broadcastCalls[0].messages.length, 1);
      assert.strictEqual(broadcastCalls[0].messages[0].type, 'assistant');
      assert.ok(broadcastCalls[0].messages[0].content.includes('**[工具结果: read_file]**'));
      assert.ok(broadcastCalls[0].messages[0].content.includes('"content": "ok"'));
    },
    failures
  );

  runTestCase(
    'watchSession(gemini): functionCall(tool_use) 内容应被保留并触发广播',
    () => {
      const broadcastCalls = runGeminiWatchSessionUpdateTest({
        sessionId: 'gemini-watch-tool-use-red',
        initialMessages: [],
        updatedMessages: [
          {
            id: 'gemini-tool-use',
            type: 'model',
            content: [
              {
                functionCall: {
                  name: 'run_command',
                  args: { command: 'echo hi' }
                }
              }
            ],
            timestamp: '2026-04-22T00:01:00.000Z'
          }
        ]
      });

      assert.strictEqual(broadcastCalls.length, 1);
      assert.strictEqual(broadcastCalls[0].sessionId, 'gemini-watch-tool-use-red');
      assert.strictEqual(broadcastCalls[0].messages.length, 1);
      assert.strictEqual(broadcastCalls[0].messages[0].type, 'assistant');
      assert.ok(broadcastCalls[0].messages[0].content.includes('**[调用工具: run_command]**'));
      assert.ok(broadcastCalls[0].messages[0].content.includes('"command": "echo hi"'));
    },
    failures
  );

  runTestCase(
    'watchSession(gemini): thinking 内容应被保留并触发广播',
    () => {
      const broadcastCalls = runGeminiWatchSessionUpdateTest({
        sessionId: 'gemini-watch-thinking-keep',
        initialMessages: [],
        updatedMessages: [
          {
            id: 'gemini-thinking',
            type: 'model',
            content: [
              {
                type: 'thinking',
                thinking: '内部推理'
              }
            ],
            timestamp: '2026-04-22T00:02:00.000Z'
          }
        ]
      });

      assert.strictEqual(broadcastCalls.length, 1);
      assert.strictEqual(broadcastCalls[0].sessionId, 'gemini-watch-thinking-keep');
      assert.strictEqual(broadcastCalls[0].messages.length, 1);
      assert.strictEqual(broadcastCalls[0].messages[0].type, 'assistant');
      assert.ok(broadcastCalls[0].messages[0].content.includes('**[思考]**'));
      assert.ok(broadcastCalls[0].messages[0].content.includes('内部推理'));
    },
    failures
  );

  if (failures.length > 0) {
    const summary = failures
      .map((item, index) => `${index + 1}. ${item.name}: ${item.error.message}`)
      .join('\n');
    throw new Error(`Parse session messages tests failed:\n${summary}`);
  }

  console.log('Parse session messages tests passed');
}

runTests();
