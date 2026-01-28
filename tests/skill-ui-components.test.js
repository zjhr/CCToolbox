const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf-8');
}

async function runTests() {
  const uploadModal = readFile('src/web/src/components/SkillUploadModal.vue');
  const updateModal = readFile('src/web/src/components/SkillUpdateModal.vue');
  const skillCard = readFile('src/web/src/components/SkillCard.vue');

  assert.ok(uploadModal.includes('选择 ZIP 或文件夹'));
  assert.ok(uploadModal.includes('拖拽'));
  assert.ok(uploadModal.includes('上传进度'));
  assert.ok(uploadModal.includes('解压进度'));

  assert.ok(updateModal.includes('设置更新源'));
  assert.ok(updateModal.includes('owner/repo'));
  assert.ok(updateModal.includes('更新源'));

  assert.ok(skillCard.includes('setInterval'));
  assert.ok(skillCard.includes('reinstallCountdownColor'));
  assert.ok(skillCard.includes('可重新安装'));
  assert.ok(skillCard.includes('设置更新'));

  console.log('Skill UI component tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
