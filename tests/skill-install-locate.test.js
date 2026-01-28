const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function writeSkill(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\nname: "${name}"\n---\n\n# ${name}\n`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-skill-install-locate-'));
  process.env.CCTOOLBOX_HOME = tempRoot;
  process.env.HOME = tempRoot;

  const { SkillService } = require('../src/server/services/skill-service');
  const service = new SkillService();

  const repoDir = path.join(tempRoot, 'repo');
  const nestedDir = path.join(repoDir, 'skills', 'agent-browser');
  writeSkill(nestedDir, 'Agent Browser');

  const resolved = service.findSkillDirInRepo(repoDir, 'agent-browser');
  assert.strictEqual(resolved, nestedDir);

  console.log('Skill install locate tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
