const assert = require('assert');
const http = require('http');

function clearModelListModuleCache() {
  try {
    delete require.cache[require.resolve('../src/server/services/model-list')];
  } catch (error) {
    // ignore
  }
}

function loadModelListService() {
  clearModelListModuleCache();
  return require('../src/server/services/model-list');
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        port: address.port,
        close: () => new Promise((closeResolve) => server.close(closeResolve))
      });
    });
  });
}

function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function runTestCase(name, run, failures) {
  try {
    await run();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

async function runModelListTests() {
  const failures = [];

  await runTestCase(
    '应导出 fetchModelsWithFallback',
    async () => {
      const service = loadModelListService();
      assert.strictEqual(typeof service.fetchModelsWithFallback, 'function');
    },
    failures
  );

  await runTestCase(
    'baseUrl/models 成功时应优先返回，且不继续后续兜底',
    async () => {
      const requests = [];
      const mock = await startServer((req, res) => {
        requests.push(req.url);
        if (req.url === '/api/models') {
          return writeJson(res, 200, { data: [{ id: 'base-model' }] });
        }
        if (req.url === '/api/v1/models') {
          return writeJson(res, 200, { data: [{ id: 'v1-model' }] });
        }
        if (req.url === '/models') {
          return writeJson(res, 200, { data: [{ id: 'root-model' }] });
        }
        return writeJson(res, 404, { error: 'unknown path' });
      });

      try {
        const service = loadModelListService();
        const result = await service.getModelsForChannel({
          id: 'case-root',
          baseUrl: `http://127.0.0.1:${mock.port}/api`,
          apiKey: 'test'
        }, 'claude', true);

        assert.deepStrictEqual(result.models, ['base-model']);
        assert.strictEqual(result.source, 'api');
        assert.deepStrictEqual(requests, ['/api/models']);
        assert.strictEqual(requests.includes('/api/v1/models'), false);
        assert.strictEqual(requests.includes('/models'), false);
      } finally {
        await mock.close();
      }
    },
    failures
  );

  await runTestCase(
    'baseUrl/models 失败时应先尝试 origin/v1/models，再尝试 baseUrl/v1/models 并返回成功结果',
    async () => {
      const requests = [];
      const delayMs = 120;
      const mock = await startServer((req, res) => {
        requests.push(req.url);
        if (req.url === '/api/models') {
          setTimeout(() => writeJson(res, 404, { error: 'not found' }), delayMs);
          return;
        }
        if (req.url === '/api/v1/models') {
          return writeJson(res, 200, { data: [{ id: 'v1-model' }] });
        }
        if (req.url === '/models') {
          return writeJson(res, 200, { data: [{ id: 'root-model' }] });
        }
        return writeJson(res, 500, { error: 'unknown path' });
      });

      try {
        const service = loadModelListService();
        const startedAt = Date.now();
        const result = await service.getModelsForChannel({
          id: 'case-base',
          baseUrl: `http://127.0.0.1:${mock.port}/api`,
          apiKey: 'test'
        }, 'claude', true);
        const elapsed = Date.now() - startedAt;

        assert.deepStrictEqual(result.models, ['v1-model']);
        assert.strictEqual(result.source, 'api');
        assert.deepStrictEqual(requests, ['/api/models', '/v1/models', '/api/v1/models']);
        assert.ok(elapsed >= delayMs, `fallback elapsed too short: ${elapsed}ms`);
        assert.strictEqual(requests.includes('/models'), false);
      } finally {
        await mock.close();
      }
    },
    failures
  );

  await runTestCase(
    'baseUrl 以 /v1 结尾时应按 baseUrl/models -> origin/v1/models -> origin/models 回退',
    async () => {
      const requests = [];
      const mock = await startServer((req, res) => {
        requests.push(req.url);
        if (req.url === '/openai/v1/models') {
          return writeJson(res, 404, { error: 'not found' });
        }
        if (req.url === '/models') {
          return writeJson(res, 200, { data: [{ id: 'origin-model' }] });
        }
        return writeJson(res, 404, { error: 'unknown path' });
      });

      try {
        const service = loadModelListService();
        const result = await service.getModelsForChannel({
          id: 'case-v1',
          baseUrl: `http://127.0.0.1:${mock.port}/openai/v1`,
          apiKey: 'test'
        }, 'claude', true);

        assert.deepStrictEqual(result.models, ['origin-model']);
        assert.strictEqual(result.source, 'api');
        assert.deepStrictEqual(requests, ['/openai/v1/models', '/v1/models', '/models']);
        assert.strictEqual(requests.includes('/openai/v1/v1/models'), false);
      } finally {
        await mock.close();
      }
    },
    failures
  );

  await runTestCase(
    'origin baseUrl 不应产生重复 /models，应按 /models -> /v1/models 顺序尝试',
    async () => {
      const requests = [];
      const mock = await startServer((req, res) => {
        requests.push(req.url);
        if (req.url === '/models') {
          return writeJson(res, 404, { error: 'not found' });
        }
        if (req.url === '/v1/models') {
          return writeJson(res, 200, { data: [{ id: 'origin-v1-model' }] });
        }
        return writeJson(res, 404, { error: 'unknown path' });
      });

      try {
        const service = loadModelListService();
        const result = await service.getModelsForChannel({
          id: 'case-origin',
          baseUrl: `http://127.0.0.1:${mock.port}`,
          apiKey: 'test'
        }, 'claude', true);

        assert.deepStrictEqual(result.models, ['origin-v1-model']);
        assert.strictEqual(result.source, 'api');
        assert.deepStrictEqual(requests, ['/models', '/v1/models']);
        assert.strictEqual(requests.filter((item) => item === '/models').length, 1);
      } finally {
        await mock.close();
      }
    },
    failures
  );

  if (failures.length > 0) {
    const summary = failures
      .map((item, index) => `${index + 1}. ${item.name}: ${item.error.message}`)
      .join('\n');
    throw new Error(`model-list tests failed:\n${summary}`);
  }

  console.log('model-list tests passed');
}

runModelListTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
