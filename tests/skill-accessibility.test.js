const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf-8');
}

async function runTests() {
  const skillsPanel = readFile('src/web/src/components/SkillsPanel.vue');
  const uploadModal = readFile('src/web/src/components/SkillUploadModal.vue');
  const updateModal = readFile('src/web/src/components/SkillUpdateModal.vue');
  const skillCard = readFile('src/web/src/components/SkillCard.vue');

  assert.ok(skillsPanel.includes('aria-label="新增技能"'));
  assert.ok(skillsPanel.includes(':focus-visible'));

  assert.ok(uploadModal.includes('role="dialog"'));
  assert.ok(uploadModal.includes('aria-modal="true"'));
  assert.ok(updateModal.includes('aria-label="设置更新源"'));
  assert.ok(updateModal.includes('aria-modal="true"'));

  assert.ok(skillCard.includes(':aria-label="`重新安装 ${skill.name} 技能`"'));
  assert.ok(skillCard.includes('card-countdown'));
  assert.ok(skillCard.includes('aria-label="设置更新"'));

  console.log('Skill accessibility tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
