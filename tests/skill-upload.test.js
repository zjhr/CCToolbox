const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  validateZipFile,
  validateDirectoryFiles,
  MAX_UPLOAD_SIZE
} = require('../src/server/middleware/upload');

function createTempFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-upload-test-'));
  const filePath = path.join(dir, 'test.zip');
  fs.writeFileSync(filePath, contents);
  return { dir, filePath };
}

async function runTests() {
  const { dir, filePath } = createTempFile(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
  try {
    const validFile = {
      originalname: 'demo.zip',
      mimetype: 'application/zip',
      path: filePath,
      size: 1024
    };
    assert.doesNotThrow(() => validateZipFile(validFile));

    const invalidFile = {
      originalname: 'demo.zip',
      mimetype: 'application/zip',
      path: filePath + '-invalid',
      size: 1024
    };
    fs.writeFileSync(invalidFile.path, 'not-a-zip');
    assert.throws(
      () => validateZipFile(invalidFile),
      (err) => err.code === 'INVALID_ZIP'
    );

    assert.throws(
      () => validateDirectoryFiles([{ originalname: '../evil', size: 1 }]),
      (err) => err.code === 'INVALID_ZIP'
    );

    assert.throws(
      () => validateDirectoryFiles([{ originalname: 'ok.txt', size: MAX_UPLOAD_SIZE + 1 }]),
      (err) => err.code === 'FILE_TOO_LARGE'
    );

    validateDirectoryFiles([{ originalname: 'dir/ok.txt', size: 128 }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('Skill upload middleware tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
