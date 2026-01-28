const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function writeSkill(dir, name, version = '1.0.0') {
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\nname: "${name}"\nversion: "${version}"\n---\n\n# ${name}\n`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n', 'utf-8');
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-reinstall-test-'));
  process.env.CCTOOLBOX_HOME = tempRoot;
  process.env.HOME = tempRoot;

  const { SkillService } = require('../src/server/services/skill-service');
  const service = new SkillService();

  const claudeDir = path.join(tempRoot, '.claude', 'skills', 'reinstall-skill');
  writeSkill(claudeDir, 'Reinstall Skill');

  const uninstallResult = service.uninstallSkill('reinstall-skill');
  assert.strictEqual(uninstallResult.success, true);

  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'stale.txt'), 'stale', 'utf-8');

  const reinstallResult = await service.reinstallSkill('reinstall-skill');
  assert.strictEqual(reinstallResult.success, true);
  assert.ok(fs.existsSync(path.join(claudeDir, 'SKILL.md')));

  const cacheMetaPath = path.join(service.skillCacheDir, 'reinstall-skill', 'metadata.json');
  const cacheMeta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf-8'));
  assert.strictEqual(cacheMeta.canReinstall, false);

  const expiredDir = path.join(tempRoot, '.claude', 'skills', 'expired-skill');
  writeSkill(expiredDir, 'Expired Skill');
  service.uninstallSkill('expired-skill');
  const expiredMetaPath = path.join(service.skillCacheDir, 'expired-skill', 'metadata.json');
  const expiredMeta = JSON.parse(fs.readFileSync(expiredMetaPath, 'utf-8'));
  expiredMeta.reinstallExpiresAt = new Date(Date.now() - 1000).toISOString();
  expiredMeta.canReinstall = true;
  fs.writeFileSync(expiredMetaPath, JSON.stringify(expiredMeta, null, 2));
  service.cachedMetaCache.delete(service.getDirectoryKey('expired-skill'));

  await assert.rejects(
    () => service.reinstallSkill('expired-skill'),
    (err) => err.code === 'REINSTALL_EXPIRED'
  );

  removeDir(tempRoot);
  console.log('Skill reinstall tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
