const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildTemporarySpecs } = require('../src/server/services/openspec.service');

async function withTempDir(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-openspec-temp-'));
  try {
    return await run(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content = '') {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function flattenNodes(nodes) {
  const result = [];
  const queue = Array.isArray(nodes) ? [...nodes] : [];
  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    result.push(node);
    if (Array.isArray(node.children)) {
      queue.push(...node.children);
    }
  }
  return result;
}

async function runTemporarySpecsTests() {
  assert.strictEqual(typeof buildTemporarySpecs, 'function', 'buildTemporarySpecs 应为函数');

  await withTempDir(async (tempRoot) => {
    const baseDir = path.join(tempRoot, 'openspec');
    const emptyItems = buildTemporarySpecs(baseDir);
    assert.deepStrictEqual(emptyItems, [], '无 openspec 目录时应返回空数组');

    writeFile(path.join(baseDir, 'changes', 'add-auth', 'specs', 'api', 'spec.md'), '# spec');
    writeFile(path.join(baseDir, 'changes', 'add-auth', 'specs', 'api', 'notes.md'), 'notes');
    writeFile(path.join(baseDir, 'changes', 'archive', 'old-change', 'specs', 'legacy', 'spec.md'), '# legacy');
    writeFile(path.join(baseDir, 'changes', 'bad name', 'specs', 'oops', 'spec.md'), '# invalid');

    const items = buildTemporarySpecs(baseDir);
    const flattened = flattenNodes(items);
    const paths = flattened.map(node => node.path);

    assert.ok(paths.some(p => p === 'changes/add-auth/specs/api'), '应包含临时规范目录节点');
    assert.ok(paths.some(p => p === 'changes/add-auth/specs/api/spec.md'), '应包含临时规范文件节点');
    assert.ok(paths.every(p => !p.includes('changes/archive')), '不应包含归档变更');
    assert.ok(paths.every(p => !p.includes('changes/bad name')), '不应包含非法变更目录');

    flattened.forEach((node) => {
      assert.strictEqual(node.isTemporary, true, '临时规范节点应标记 isTemporary');
      assert.strictEqual(node.changeId, 'add-auth', '临时规范节点应包含 changeId');
      assert.strictEqual(node.changePath, 'changes/add-auth', '临时规范节点应包含 changePath');
    });
  });

  console.log('Temporary specs tests passed');
}

runTemporarySpecsTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
