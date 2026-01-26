const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-skill-cache-test-'));
  try {
    return await run(tempRoot);
  } finally {
    removeDir(tempRoot);
  }
}

function writeSkill(dir, name, description = 'test skill', version = '1.0.0') {
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\nname: "${name}"\ndescription: "${description}"\nversion: "${version}"\n---\n\n# ${name}\n`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n', 'utf-8');
}

async function runTests() {
  await withTempDir(async (tempRoot) => {
    process.env.CCTOOLBOX_HOME = tempRoot;
    process.env.HOME = tempRoot;

    const { SkillService, LRUSkillCache } = require('../src/server/services/skill-service');
    const service = new SkillService();

    const claudeDir = path.join(tempRoot, '.claude', 'skills');
    const codexDir = path.join(tempRoot, '.codex', 'skills');

    const singleSkillDir = path.join(claudeDir, 'demo-skill');
    writeSkill(singleSkillDir, 'Demo Skill', '单平台技能');

    const cachedMeta = service.cacheSkill('demo-skill', {
      installedPlatforms: ['claude']
    });
    assert.strictEqual(cachedMeta.installedPlatforms[0], 'claude');

    const cachedList = service.listCached();
    assert.strictEqual(cachedList.length, 1);
    assert.strictEqual(cachedList[0].directory, 'demo-skill');

    service.uninstallSkill('demo-skill', ['claude'], { skipCache: true });
    assert.ok(!fs.existsSync(singleSkillDir));

    service.restoreCache('demo-skill', ['claude']);
    assert.ok(fs.existsSync(path.join(singleSkillDir, 'SKILL.md')));

    const multiSkillClaude = path.join(claudeDir, 'multi-skill');
    const multiSkillCodex = path.join(codexDir, 'multi-skill');
    writeSkill(multiSkillClaude, 'Multi Skill', '多平台技能');
    writeSkill(multiSkillCodex, 'Multi Skill', '多平台技能');

    service.disableSkill('multi-skill');
    assert.ok(!fs.existsSync(multiSkillClaude));
    assert.ok(!fs.existsSync(multiSkillCodex));

    const disabled = service.listCached().find(item => item.directory === 'multi-skill');
    assert.ok(disabled);
    assert.strictEqual(disabled.isDisabled, true);

    service.enableSkill('multi-skill');
    assert.ok(fs.existsSync(multiSkillClaude));
    assert.ok(fs.existsSync(multiSkillCodex));

    service.deleteCachedSkill('multi-skill');
    const remaining = service.listCached().filter(item => item.directory === 'multi-skill');
    assert.strictEqual(remaining.length, 0);

    const lru = new LRUSkillCache(2, 0);
    lru.set('a', 1);
    lru.set('b', 2);
    assert.strictEqual(lru.get('a'), 1);
    lru.set('c', 3);
    assert.strictEqual(lru.get('b'), undefined);
    assert.strictEqual(lru.get('a'), 1);

    assert.throws(
      () => service.resolveCacheDirectory('../evil'),
      (err) => err.code === 'INVALID_CACHE_PATH'
    );
  });

  console.log('Skill cache tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
