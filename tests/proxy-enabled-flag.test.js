/**
 * 代理开关意图标记 + settings 备份刷新
 *
 * 回归：
 * 1) 关闭代理后不应因 active-channel / 渠道 backup 被自动判定为开启
 * 2) 开启代理前 force 刷新 backup，避免用陈旧 backup 还原 env
 */
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

function clearModuleCache(modulePaths) {
  modulePaths.forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (e) {
      // ignore
    }
  });
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-proxy-flag-'));
  const originalHome = process.env.HOME;
  const originalCctoolboxHome = process.env.CCTOOLBOX_HOME;

  process.env.HOME = tempRoot;
  process.env.CCTOOLBOX_HOME = tempRoot;

  try {
    return await run(tempRoot);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalCctoolboxHome === undefined) delete process.env.CCTOOLBOX_HOME;
    else process.env.CCTOOLBOX_HOME = originalCctoolboxHome;
    removeDir(tempRoot);
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function run() {
  await withTempHome(async (tempRoot) => {
    const claudeDir = path.join(tempRoot, '.claude');
    const appDir = path.join(tempRoot, '.cctoolbox');
    ensureDir(claudeDir);
    ensureDir(appDir);

    writeJson(path.join(claudeDir, 'settings.json'), {
      env: {
        ANTHROPIC_BASE_URL: 'https://real.example/v1',
        ANTHROPIC_API_KEY: 'sk-real',
        CUSTOM_KEEP: 'keep-me'
      }
    });

    // 模拟渠道写入留下的陈旧 backup（与当前 settings 不一致）
    writeJson(path.join(appDir, 'settings.json.cctoolbox-backup'), {
      env: {
        ANTHROPIC_BASE_URL: 'https://stale.example/v1',
        ANTHROPIC_API_KEY: 'sk-stale'
      }
    });
    writeJson(path.join(appDir, 'active-channel.json'), {
      activeChannelId: 'ch-1'
    });

    const modules = [
      '../src/server/services/proxy-runtime',
      '../src/server/services/settings-manager',
      '../src/utils/app-path-manager'
    ];
    clearModuleCache(modules);

    const { setProxyEnabled, isProxyEnabled } = require('../src/server/services/proxy-runtime');
    const {
      setProxyConfig,
      restoreSettings,
      isProxyConfig,
      readSettings,
      hasBackup
    } = require('../src/server/services/settings-manager');

    // 1) 无显式标记时不应视为开启
    assert.strictEqual(isProxyEnabled('claude'), false);

    // 2) 开启代理：force 刷新 backup 为当前真实配置
    setProxyConfig(10088);
    setProxyEnabled('claude', true);
    assert.strictEqual(isProxyEnabled('claude'), true);
    assert.strictEqual(isProxyConfig(), true);

    const live = readSettings();
    assert.strictEqual(live.env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:10088');
    assert.strictEqual(live.env.ANTHROPIC_API_KEY, 'PROXY_KEY');
    assert.strictEqual(live.env.CUSTOM_KEEP, 'keep-me', 'other env keys must be preserved');
    assert.ok(hasBackup());

    // 3) 关闭：还原到开启前的真实配置，而不是陈旧 backup
    restoreSettings();
    setProxyEnabled('claude', false);
    assert.strictEqual(isProxyEnabled('claude'), false);
    assert.strictEqual(isProxyConfig(), false);

    const restored = readSettings();
    assert.strictEqual(restored.env.ANTHROPIC_BASE_URL, 'https://real.example/v1');
    assert.strictEqual(restored.env.ANTHROPIC_API_KEY, 'sk-real');
    assert.strictEqual(restored.env.CUSTOM_KEEP, 'keep-me');
    assert.notStrictEqual(
      restored.env.ANTHROPIC_BASE_URL,
      'https://stale.example/v1',
      'must not restore stale channel-write backup'
    );

    // 4) active-channel 残留 + 无 enabled 标记 ≠ 应自动开启
    assert.ok(fs.existsSync(path.join(appDir, 'active-channel.json')));
    assert.strictEqual(isProxyEnabled('claude'), false);
  });

  console.log('proxy-enabled-flag.test.js: all assertions passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
