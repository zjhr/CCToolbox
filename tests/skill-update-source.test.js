const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function writeSkill(dir, name, version) {
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\nname: "${name}"\nversion: "${version}"\n---\n\n# ${name}\n`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n', 'utf-8');
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-skill-update-source-'));
  process.env.CCTOOLBOX_HOME = tempRoot;
  process.env.HOME = tempRoot;

  const { SkillService } = require('../src/server/services/skill-service');
  const service = new SkillService();

  const claudeDir = path.join(tempRoot, '.claude', 'skills', 'demo-skill');
  writeSkill(claudeDir, 'Demo Skill', '0.1.0');

  service.githubClient = {
    fetchUpdates: async () => ([{ name: '0.2.0' }])
  };

  const entry = await service.setSkillUpdateSource('demo-skill', 'owner/repo#dev');
  assert.strictEqual(entry.repoOwner, 'owner');
  assert.strictEqual(entry.repoName, 'repo');
  assert.strictEqual(entry.repoBranch, 'dev');
  assert.strictEqual(entry.hasUpdate, true);

  const saved = JSON.parse(fs.readFileSync(service.skillUpdateConfigPath, 'utf-8'));
  const key = Object.keys(saved.skills || {})[0];
  assert.ok(key);
  assert.strictEqual(saved.skills[key].repoOwner, 'owner');

  entry.lastAppliedVersion = '0.2.0';
  await service.refreshSkillUpdateStatus(entry, { latestVersion: '0.2.0' });
  assert.strictEqual(entry.hasUpdate, false);

  const clearResult = await service.setSkillUpdateSource('demo-skill', '');
  assert.strictEqual(clearResult.removed, true);

  console.log('Skill update source tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
