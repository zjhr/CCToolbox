const assert = require('assert');

const { resolveProjectMeta } = require('../src/server/services/codex-sessions');

function runCodexProjectMetaTests() {
  const rootProject = resolveProjectMeta({ cwd: '/' });
  assert.strictEqual(rootProject.projectName, '/');
  assert.strictEqual(rootProject.projectDisplayName, '/');
  assert.strictEqual(rootProject.projectFullPath, '/');

  const normalProject = resolveProjectMeta({ cwd: '/Users/mac/ai/cc-tool' });
  assert.strictEqual(normalProject.projectName, 'cc-tool');

  const gitProject = resolveProjectMeta({
    cwd: '/',
    git: {
      repositoryUrl: 'https://github.com/openai/codex.git'
    }
  });
  assert.strictEqual(gitProject.projectName, 'codex');
  assert.strictEqual(gitProject.projectDisplayName, 'codex');

  const unknownProject = resolveProjectMeta({});
  assert.strictEqual(unknownProject.projectName, 'unknown');

  console.log('Codex project meta tests passed');
}

runCodexProjectMetaTests();
