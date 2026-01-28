const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function writeSkill(dir, name, version) {
  fs.mkdirSync(dir, { recursive: true });
  const content = `---\nname: "${name}"\nversion: "${version}"\n---\n\n# ${name}\n`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n', 'utf-8');
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-check-update-test-'));
  process.env.CCTOOLBOX_HOME = tempRoot;
  process.env.HOME = tempRoot;

  const { SkillService } = require('../src/server/services/skill-service');
  const service = new SkillService();

  const claudeDir = path.join(tempRoot, '.claude', 'skills', 'demo-skill');
  writeSkill(claudeDir, 'Demo Skill', '0.1.0');

  service.listSkills = async () => ([{
    directory: 'demo-skill',
    name: 'Demo Skill',
    installed: true,
    repoOwner: 'owner',
    repoName: 'repo',
    repoBranch: 'main'
  }]);

  let fetchCount = 0;
  service.githubClient = {
    fetchUpdates: async () => {
      fetchCount += 1;
      return [
        { name: 'invalid' },
        { name: '0.2.0' }
      ];
    }
  };

  const updates = await service.checkUpdate('owner/repo');
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].latestVersion, '0.2.0');
  assert.strictEqual(updates[0].currentVersion, '0.1.0');
  assert.deepStrictEqual(updates[0].installedPlatforms, ['claude']);
  assert.strictEqual(fetchCount, 1);

  const cachedUpdates = await service.checkUpdate('owner/repo');
  assert.strictEqual(cachedUpdates.length, 1);
  assert.strictEqual(fetchCount, 1);

  service.updateCheckCache.set('owner/repo', {
    updates: [],
    timestamp: Date.now() - 5 * 60 * 1000 - 10
  });
  await service.checkUpdate('owner/repo');
  assert.strictEqual(fetchCount, 2);

  const noVersionDir = path.join(tempRoot, '.claude', 'skills', 'noversion-skill');
  fs.mkdirSync(noVersionDir, { recursive: true });
  fs.writeFileSync(path.join(noVersionDir, 'SKILL.md'), '---\nname: "No Version"\n---\n', 'utf-8');
  fs.writeFileSync(path.join(noVersionDir, 'index.js'), 'module.exports = {};\n', 'utf-8');

  service.listSkills = async () => ([
    {
      directory: 'demo-skill',
      name: 'Demo Skill',
      installed: true,
      repoOwner: 'owner',
      repoName: 'repo',
      repoBranch: 'main'
    },
    {
      directory: 'noversion-skill',
      name: 'No Version',
      installed: true,
      repoOwner: 'owner',
      repoName: 'repo',
      repoBranch: 'main'
    }
  ]);

  service.updateCheckCache.delete('owner/repo');
  const updatesWithNoVersion = await service.checkUpdate('owner/repo');
  const noVersionEntry = updatesWithNoVersion.find(item => item.directory === 'noversion-skill');
  assert.ok(noVersionEntry);
  assert.strictEqual(noVersionEntry.currentVersion, '0.0.0');

  await assert.rejects(
    () => service.checkUpdate('invalid'),
    (err) => err.code === 'INVALID_REPO_URL'
  );

  removeDir(tempRoot);
  console.log('Skill check update tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
