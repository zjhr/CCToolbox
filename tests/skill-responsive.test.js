const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf-8');
}

async function runTests() {
  const uploadModal = readFile('src/web/src/components/SkillUploadModal.vue');
  const updateModal = readFile('src/web/src/components/SkillUpdateModal.vue');
  const skillsPanel = readFile('src/web/src/components/SkillsPanel.vue');
  const skillCard = readFile('src/web/src/components/SkillCard.vue');

  assert.ok(uploadModal.includes('@media (max-width: 480px)'));
  assert.ok(updateModal.includes('@media (max-width: 480px)'));
  assert.ok(skillsPanel.includes('@media (max-width: 640px)'));
  assert.ok(skillCard.includes('@media (max-width: 640px)'));
  assert.ok(skillCard.includes('min-height: 44px'));

  console.log('Skill responsive tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
