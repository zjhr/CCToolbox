/**
 * 技能上传中间件（ZIP 或文件夹）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_ZIP_EXTS = new Set(['.zip']);
const ALLOWED_ZIP_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream'
]);
const ZIP_MAGIC_NUMBERS = new Set(['504b0304', '504b0506', '504b0708']);

function buildUploadError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function generateSafeName(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  if (crypto.randomUUID) {
    return `${crypto.randomUUID()}${ext}`;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
}

function normalizeRelativePath(input) {
  if (!input) return '';
  let decoded = input;
  try {
    decoded = decodeURIComponent(input);
  } catch (err) {
    decoded = input;
  }
  const normalized = decoded.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.includes('..')) {
    return null;
  }
  return normalized;
}

function ensureUploadBase(req) {
  if (!req.uploadBaseDir) {
    req.uploadBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-skill-upload-'));
  }
  return req.uploadBaseDir;
}

function getZipMagicNumber(filePath) {
  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(filePath, 'r');
  try {
    const bytes = fs.readSync(fd, buffer, 0, 4, 0);
    if (bytes < 4) return null;
    return buffer.toString('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function validateZipFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_ZIP_EXTS.has(ext)) {
    throw buildUploadError('仅支持 ZIP 文件上传', 'INVALID_ZIP');
  }
  if (file.mimetype && !ALLOWED_ZIP_MIMES.has(file.mimetype)) {
    throw buildUploadError('ZIP 文件类型不正确', 'INVALID_ZIP');
  }
  const magic = getZipMagicNumber(file.path);
  if (!magic || !ZIP_MAGIC_NUMBERS.has(magic)) {
    throw buildUploadError('ZIP 文件损坏,请检查文件完整性', 'INVALID_ZIP');
  }
}

function validateDirectoryFiles(files) {
  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
  if (totalSize > MAX_UPLOAD_SIZE) {
    throw buildUploadError('文件大小超过 50MB 限制', 'FILE_TOO_LARGE');
  }
  for (const file of files) {
    const normalized = normalizeRelativePath(file.originalname || '');
    if (!normalized) {
      throw buildUploadError('上传文件路径非法', 'INVALID_ZIP');
    }
  }
}

function moveUploadedFilesWithPaths(req, files) {
  const rawPaths = req.body?.paths;
  if (!rawPaths) return;
  const paths = Array.isArray(rawPaths) ? rawPaths : [rawPaths];
  if (paths.length !== files.length) return;

  const baseDir = ensureUploadBase(req);
  files.forEach((file, index) => {
    const relativePath = normalizeRelativePath(paths[index] || '');
    if (!relativePath) {
      throw buildUploadError('上传文件路径非法', 'INVALID_ZIP');
    }
    const targetPath = path.join(baseDir, relativePath);
    const targetDir = path.dirname(targetPath);
    fs.mkdirSync(targetDir, { recursive: true });
    try {
      fs.renameSync(file.path, targetPath);
    } catch (err) {
      if (err.code === 'EXDEV') {
        fs.copyFileSync(file.path, targetPath);
        fs.unlinkSync(file.path);
      } else {
        throw err;
      }
    }
    file.path = targetPath;
    file.originalname = relativePath;
  });
}

function cleanupUploadTemp(req) {
  if (req.uploadBaseDir && fs.existsSync(req.uploadBaseDir)) {
    fs.rmSync(req.uploadBaseDir, { recursive: true, force: true });
  }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const baseDir = ensureUploadBase(req);
      const normalized = normalizeRelativePath(file.originalname || '');
      if (normalized && normalized.includes('/')) {
        const targetDir = path.join(baseDir, path.dirname(normalized));
        fs.mkdirSync(targetDir, { recursive: true });
        return cb(null, targetDir);
      }
      return cb(null, baseDir);
    } catch (err) {
      return cb(err);
    }
  },
  filename(req, file, cb) {
    const normalized = normalizeRelativePath(file.originalname || '');
    if (normalized && normalized.includes('/')) {
      return cb(null, path.basename(normalized));
    }
    return cb(null, generateSafeName(file.originalname));
  }
});

const uploader = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE
  }
});

function skillUploadMiddleware(req, res, next) {
  uploader.any()(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(buildUploadError('文件大小超过 50MB 限制', 'FILE_TOO_LARGE'));
      }
      return next(buildUploadError(err.message || '文件上传失败', 'UPLOAD_FAILED'));
    }

    const files = req.files || [];
    if (files.length === 0) {
      return next(buildUploadError('未检测到上传文件', 'NO_FILE'));
    }

    req.uploadedFiles = files;

    try {
      const singleFile = files[0];
      const hasPath = singleFile?.originalname?.includes('/') || singleFile?.originalname?.includes('\\');
      const isZipUpload = files.length === 1
        && path.extname(singleFile.originalname || '').toLowerCase() === '.zip'
        && !hasPath;
      const isDirectoryUpload = files.length > 1 || (files.length === 1 && hasPath);

      if (isZipUpload) {
        validateZipFile(singleFile);
        req.uploadType = 'zip';
      } else if (isDirectoryUpload) {
        validateDirectoryFiles(files);
        moveUploadedFilesWithPaths(req, files);
        req.uploadType = 'directory';
      } else {
        throw buildUploadError('仅支持 ZIP 文件或文件夹上传', 'INVALID_ZIP');
      }
      return next();
    } catch (error) {
      cleanupUploadTemp(req);
      return next(error);
    }
  });
}

module.exports = {
  MAX_UPLOAD_SIZE,
  cleanupUploadTemp,
  skillUploadMiddleware,
  validateDirectoryFiles,
  validateZipFile
};
