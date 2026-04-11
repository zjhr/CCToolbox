const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function setPlatform(value) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value
  });
}

function loadEnvChecker() {
  delete require.cache[require.resolve('../src/server/services/env-checker')];
  return require('../src/server/services/env-checker');
}

async function withTempWindowsEnv(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-env-checker-test-')
  );
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalPlatform = process.platform;

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;

  try {
    setPlatform('win32');
    return await run(tempRoot);
  } finally {
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

    setPlatform(originalPlatform);
    removeDir(tempRoot);
  }
}

async function runEnvCheckerTests() {
  await withTempWindowsEnv(async (tempRoot) => {
    const profilePath = path.join(
      tempRoot,
      'Documents',
      'PowerShell',
      'Microsoft.PowerShell_profile.ps1'
    );
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    fs.writeFileSync(profilePath, [
      '# powershell profile',
      '$env:OPENAI_API_KEY = "sk-test-12345678"',
      '$env:GEMINI_CLI_IDE_WORKSPACE_PATH = "workspace"',
      '$env:anthropic_base_url = "http://127.0.0.1:10088"',
      '$env:OPENAI_OTHER = "not-sensitive-suffix"'
    ].join('\n'), 'utf8');

    process.env.OPENAI_API_KEY = 'sk-process-ABCDEFGH';

    try {
      const { checkEnvConflicts, getConflictStats } = loadEnvChecker();
      const conflicts = checkEnvConflicts();

      const openAiProfileConflict = conflicts.find(item =>
        item.varName === 'OPENAI_API_KEY' &&
        item.sourceType === 'windows-profile'
      );
      assert.ok(openAiProfileConflict);
      assert.strictEqual(openAiProfileConflict.platform, 'codex');
      assert.ok(openAiProfileConflict.sourcePath.includes('Microsoft.PowerShell_profile.ps1:2'));
      assert.ok(openAiProfileConflict.varValue.includes('****'));

      const anthropicProfileConflict = conflicts.find(item =>
        item.varName === 'ANTHROPIC_BASE_URL' &&
        item.sourceType === 'windows-profile'
      );
      assert.ok(anthropicProfileConflict);
      assert.strictEqual(anthropicProfileConflict.platform, 'claude');

      const ideNoiseConflict = conflicts.find(item =>
        item.varName === 'GEMINI_CLI_IDE_WORKSPACE_PATH'
      );
      assert.strictEqual(ideNoiseConflict, undefined);

      const nonSensitiveSuffix = conflicts.find(item =>
        item.varName === 'OPENAI_OTHER'
      );
      assert.strictEqual(nonSensitiveSuffix, undefined);

      const processConflict = conflicts.find(item =>
        item.varName === 'OPENAI_API_KEY' &&
        item.sourceType === 'process'
      );
      assert.ok(processConflict);

      const stats = getConflictStats(conflicts);
      assert.ok(stats.bySourceType['windows-profile'] >= 2);
      assert.ok(stats.byPlatform.codex >= 1);
      assert.ok(stats.byPlatform.claude >= 1);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  console.log('env-checker tests passed');
}

runEnvCheckerTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
