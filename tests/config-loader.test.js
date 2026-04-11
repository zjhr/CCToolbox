const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function clearLoaderCaches() {
  delete require.cache[require.resolve('../src/config/loader')];
  delete require.cache[require.resolve('../src/config/default')];
  delete require.cache[require.resolve('../src/utils/app-path-manager')];
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-config-loader-test-'));
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalCctoolboxHome = process.env.CCTOOLBOX_HOME;

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
  process.env.CCTOOLBOX_HOME = tempRoot;

  try {
    clearLoaderCaches();
    return await run(tempRoot);
  } finally {
    clearLoaderCaches();

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }

    if (originalCctoolboxHome === undefined) {
      delete process.env.CCTOOLBOX_HOME;
    } else {
      process.env.CCTOOLBOX_HOME = originalCctoolboxHome;
    }

    removeDir(tempRoot);
  }
}

async function runTests() {
  await withTempHome(async (tempRoot) => {
    const configPath = path.join(tempRoot, '.claude', 'cctoolbox', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      '\uFEFF{"ports":{"webUI":18099},"maxDisplaySessions":77}',
      'utf8'
    );

    const { loadConfig } = require('../src/config/loader');
    const loaded = loadConfig();

    assert.strictEqual(loaded.ports.webUI, 18099);
    assert.strictEqual(loaded.maxDisplaySessions, 77);
  });

  console.log('config-loader tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});

