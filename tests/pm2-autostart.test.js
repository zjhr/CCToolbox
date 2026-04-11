const assert = require('assert');
let pm2 = null;
try {
  pm2 = require('pm2');
} catch (err) {
  // 当前环境未安装依赖时跳过（不影响业务代码）
}

function setPlatform(value) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value
  });
}

function createMockRes() {
  return {
    payload: null,
    json(data) {
      this.payload = data;
      return this;
    }
  };
}

function getRouteHandler(router, method) {
  const layer = router.stack.find(item => item.route && item.route.path === '/' && item.route.methods[method]);
  if (!layer) {
    throw new Error(`route ${method.toUpperCase()} / not found`);
  }
  return layer.route.stack[0].handle;
}

async function runPm2AutostartTests() {
  if (!pm2) {
    console.log('pm2-autostart tests skipped (pm2 module not available)');
    return;
  }

  const originalPlatform = process.platform;
  const originalConnect = pm2.connect;
  let connectCalled = false;

  try {
    setPlatform('win32');
    pm2.connect = () => {
      connectCalled = true;
      throw new Error('pm2.connect should not be called on win32 early-return path');
    };

    delete require.cache[require.resolve('../src/server/api/pm2-autostart')];
    const createRouter = require('../src/server/api/pm2-autostart');
    const router = createRouter();

    const getHandler = getRouteHandler(router, 'get');
    const postHandler = getRouteHandler(router, 'post');

    const getRes = createMockRes();
    await getHandler({}, getRes);
    assert.strictEqual(getRes.payload.success, true);
    assert.strictEqual(getRes.payload.data.platform, 'win32');
    assert.strictEqual(getRes.payload.data.enabled, false);
    assert.ok(Array.isArray(getRes.payload.data.actionableHints));
    assert.ok(getRes.payload.data.actionableHints.length >= 1);

    const enableRes = createMockRes();
    await postHandler({ body: { action: 'enable' } }, enableRes);
    assert.strictEqual(enableRes.payload.success, false);
    assert.ok(enableRes.payload.message.includes('Windows'));
    assert.ok(Array.isArray(enableRes.payload.actionableHints));

    const disableRes = createMockRes();
    await postHandler({ body: { action: 'disable' } }, disableRes);
    assert.strictEqual(disableRes.payload.success, false);
    assert.ok(disableRes.payload.message.includes('Windows'));
    assert.ok(Array.isArray(disableRes.payload.actionableHints));

    assert.strictEqual(connectCalled, false);
  } finally {
    pm2.connect = originalConnect;
    setPlatform(originalPlatform);
  }

  console.log('pm2-autostart tests passed');
}

runPm2AutostartTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
