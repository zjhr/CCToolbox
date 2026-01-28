const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function writeSkill(dir, name, description = 'test skill', version = '1.0.0') {
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\nname: "${name}"\ndescription: "${description}"\nversion: "${version}"\n---\n\n# ${name}\n`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n', 'utf-8');
}

function buildZipFromDir(sourceDir, zipPath, rootName) {
  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir, rootName);
  zip.writeZip(zipPath);
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-upload-service-test-'));
  process.env.CCTOOLBOX_HOME = tempRoot;
  process.env.HOME = tempRoot;

  const { SkillService } = require('../src/server/services/skill-service');
  const service = new SkillService();

  const uploadDir = path.join(tempRoot, 'upload');
  fs.mkdirSync(uploadDir, { recursive: true });

  const sourceDir = path.join(tempRoot, 'source-skill');
  writeSkill(sourceDir, 'Upload Skill', '上传测试', '1.0.0');

  const zipPath = path.join(uploadDir, 'skill.zip');
  buildZipFromDir(sourceDir, zipPath, 'upload-skill');

  const result = await service.uploadSkill({
    path: zipPath,
    originalname: 'upload-skill.zip'
  }, {
    uploadType: 'zip',
    uploadBaseDir: uploadDir
  });

  assert.strictEqual(result.success, true);
  const installedPath = path.join(tempRoot, '.claude', 'skills', 'upload-skill', 'SKILL.md');
  assert.ok(fs.existsSync(installedPath));

  const zipSameDir = path.join(tempRoot, 'upload-same');
  fs.mkdirSync(zipSameDir, { recursive: true });
  const zipSamePath = path.join(zipSameDir, 'skill.zip');
  buildZipFromDir(sourceDir, zipSamePath, 'upload-skill');

  await assert.rejects(
    () => service.uploadSkill({
      path: zipSamePath,
      originalname: 'upload-skill.zip'
    }, {
      uploadType: 'zip',
      uploadBaseDir: zipSameDir
    }),
    (err) => err.code === 'VERSION_SAME'
  );

  const zipDiffDir = path.join(tempRoot, 'upload-diff');
  fs.mkdirSync(zipDiffDir, { recursive: true });
  const zipDiffPath = path.join(zipDiffDir, 'skill.zip');
  writeSkill(sourceDir, 'Upload Skill', '上传测试-更新', '1.1.0');
  buildZipFromDir(sourceDir, zipDiffPath, 'upload-skill');

  const diffResult = await service.uploadSkill({
    path: zipDiffPath,
    originalname: 'upload-skill.zip'
  }, {
    uploadType: 'zip',
    uploadBaseDir: zipDiffDir
  });
  assert.strictEqual(diffResult.success, true);
  const updatedContent = fs.readFileSync(installedPath, 'utf-8');
  assert.ok(updatedContent.includes('version: "1.1.0"'));

  const zipForceDir = path.join(tempRoot, 'upload-force');
  fs.mkdirSync(zipForceDir, { recursive: true });
  const zipForcePath = path.join(zipForceDir, 'skill.zip');
  writeSkill(sourceDir, 'Upload Skill', '上传测试-覆盖', '1.0.0');
  buildZipFromDir(sourceDir, zipForcePath, 'upload-skill');

  const forceResult = await service.uploadSkill({
    path: zipForcePath,
    originalname: 'upload-skill.zip'
  }, {
    uploadType: 'zip',
    uploadBaseDir: zipForceDir,
    force: true
  });
  assert.strictEqual(forceResult.success, true);

  const invalidDir = path.join(tempRoot, 'upload-invalid');
  fs.mkdirSync(invalidDir, { recursive: true });
  const invalidZipPath = path.join(invalidDir, 'invalid.zip');
  fs.writeFileSync(invalidZipPath, 'not-zip');
  await assert.rejects(
    () => service.uploadSkill({
      path: invalidZipPath,
      originalname: 'invalid.zip'
    }, {
      uploadType: 'zip',
      uploadBaseDir: invalidDir
    }),
    (err) => err.code === 'INVALID_ZIP'
  );

  const missingDir = path.join(tempRoot, 'upload-missing');
  fs.mkdirSync(missingDir, { recursive: true });
  const missingZip = path.join(missingDir, 'missing.zip');
  const emptySource = path.join(tempRoot, 'empty-skill');
  fs.mkdirSync(emptySource, { recursive: true });
  buildZipFromDir(emptySource, missingZip, 'empty-skill');

  await assert.rejects(
    () => service.uploadSkill({
      path: missingZip,
      originalname: 'missing.zip'
    }, {
      uploadType: 'zip',
      uploadBaseDir: missingDir
    }),
    (err) => err.code === 'NO_SKILL_MD'
  );

  removeDir(tempRoot);
  console.log('Skill upload service tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
