const path = require('path');
const fs = require('fs');

const ALLOWED_EXTENSIONS = ['.md', '.json', '.yaml', '.yml'];

function resolveProjectPath(req) {
  return req.query.projectPath || req.body?.projectPath || '';
}

function resolveUserPath(req) {
  return req.query.path || req.body?.path || '';
}

function normalizeRelativePath(userPath) {
  if (!userPath) {
    throw new Error('缺少文件路径');
  }
  return userPath.replace(/\\/g, '/').replace(/^\//, '');
}

function ensureAllowedExtension(targetPath) {
  const ext = path.extname(targetPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('不支持的文件类型');
  }
}

function openspecFileGuard(req, res, next) {
  try {
    const projectPath = resolveProjectPath(req);
    if (!projectPath || !path.isAbsolute(projectPath)) {
      return res.status(400).json({ error: 'projectPath 不合法' });
    }

    const relativePath = normalizeRelativePath(resolveUserPath(req));
    const baseDir = path.resolve(projectPath, 'openspec');
    const targetPath = path.resolve(baseDir, relativePath);

    if (targetPath !== baseDir && !targetPath.startsWith(baseDir + path.sep)) {
      return res.status(400).json({ error: '非法路径访问' });
    }

    ensureAllowedExtension(targetPath);

    if (fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      if (stats.isDirectory()) {
        return res.status(400).json({ error: '路径指向目录，无法读取或写入' });
      }
    }

    req.openspec = {
      projectPath,
      baseDir,
      relativePath,
      targetPath
    };

    return next();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

module.exports = {
  openspecFileGuard
};
