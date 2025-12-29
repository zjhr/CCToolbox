const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_DIR_NAME = 'cctoolbox';
const LEGACY_DIR_NAME = 'cc-tool';
const CLAUDE_DIR_NAME = '.claude';
const GEMINI_DIR_NAME = '.gemini';
const CODEX_DIR_NAME = '.codex';
const MIGRATION_COMPLETE_FLAG = '.migration-complete';
const MIGRATION_STATUS_FILE = '.migration-status.json';
const MIGRATION_LOG_FILE = 'cctoolbox-migration.log';
const MIGRATION_ERROR_LOG_FILE = 'cctoolbox-migration-error.log';
const BACKUP_PREFIX = 'cc-tool-backup-';

let migrationInProgress = false;

function getHomeDir() {
  return process.env.CCTOOLBOX_HOME || os.homedir();
}

function getClaudeDir() {
  return path.join(getHomeDir(), CLAUDE_DIR_NAME);
}

function getLegacyAppDir() {
  return path.join(getClaudeDir(), LEGACY_DIR_NAME);
}

function getNewAppDir() {
  return path.join(getClaudeDir(), APP_DIR_NAME);
}

function getGeminiDir() {
  return path.join(getHomeDir(), GEMINI_DIR_NAME);
}

function getCodexDir() {
  return path.join(getHomeDir(), CODEX_DIR_NAME);
}

function getMigrationStatusPath() {
  return path.join(getNewAppDir(), MIGRATION_STATUS_FILE);
}

function getMigrationCompletePath() {
  return path.join(getNewAppDir(), MIGRATION_COMPLETE_FLAG);
}

function getMigrationLogPath() {
  return path.join(getClaudeDir(), MIGRATION_LOG_FILE);
}

function getMigrationErrorLogPath() {
  return path.join(getClaudeDir(), MIGRATION_ERROR_LOG_FILE);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function logMigration(message) {
  try {
    ensureDir(getClaudeDir());
    const timestamp = new Date().toISOString();
    fs.appendFileSync(getMigrationLogPath(), `[${timestamp}] ${message}\n`, 'utf8');
  } catch (error) {
    // 日志写入失败不影响主流程
  }
}

function logMigrationError(error) {
  try {
    ensureDir(getClaudeDir());
    const timestamp = new Date().toISOString();
    const message = error instanceof Error ? error.stack || error.message : String(error);
    fs.appendFileSync(getMigrationErrorLogPath(), `[${timestamp}] ${message}\n`, 'utf8');
  } catch (logError) {
    // 忽略日志写入失败
  }
}

function readMigrationStatus() {
  const statusPath = getMigrationStatusPath();
  if (!fs.existsSync(statusPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeMigrationStatus(status, detail = {}) {
  try {
    const statusPath = getMigrationStatusPath();
    ensureDir(getNewAppDir());
    const payload = {
      status,
      updatedAt: new Date().toISOString(),
      ...detail
    };
    fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    logMigrationError(error);
  }
}

function writeMigrationCompleteFlag() {
  try {
    const flagPath = getMigrationCompletePath();
    ensureDir(getNewAppDir());
    fs.writeFileSync(flagPath, new Date().toISOString(), 'utf8');
  } catch (error) {
    logMigrationError(error);
  }
}

function checkPermissions(dirPath) {
  fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
}

function checkDiskSpace() {
  if (typeof fs.statfsSync !== 'function') {
    logMigration('当前 Node 版本不支持 statfsSync，跳过磁盘空间检查');
    return;
  }

  const parentDir = getClaudeDir();
  const stats = fs.statfsSync(parentDir);
  const available = stats.bavail * stats.bsize;
  if (available <= 0) {
    throw new Error('磁盘空间不足，无法完成迁移');
  }
}

function collectFiles(dirPath, basePath = dirPath, files = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(entryPath, basePath, files);
    } else if (entry.isFile()) {
      files.push({
        fullPath: entryPath,
        relativePath: path.relative(basePath, entryPath)
      });
    } else if (entry.isSymbolicLink()) {
      const realPath = fs.realpathSync(entryPath);
      files.push({
        fullPath: realPath,
        relativePath: path.relative(basePath, entryPath)
      });
    }
  }
  return files;
}

function copyFileWithMeta(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  const stats = fs.statSync(sourcePath);
  fs.chmodSync(targetPath, stats.mode);
  fs.utimesSync(targetPath, stats.atime, stats.mtime);
}

function copyDirectory(sourceDir, targetDir, onProgress) {
  ensureDir(targetDir);
  const files = collectFiles(sourceDir);
  const total = files.length;

  files.forEach((file, index) => {
    const targetPath = path.join(targetDir, file.relativePath);
    copyFileWithMeta(file.fullPath, targetPath);
    if (onProgress) {
      onProgress(index + 1, total, file.relativePath);
    }
  });

  return total;
}

function verifyMigration(oldDir, newDir) {
  if (!fs.existsSync(oldDir) || !fs.existsSync(newDir)) {
    return false;
  }

  const oldFiles = collectFiles(oldDir);
  for (const file of oldFiles) {
    const newPath = path.join(newDir, file.relativePath);
    if (!fs.existsSync(newPath)) {
      return false;
    }
    const oldStats = fs.statSync(file.fullPath);
    const newStats = fs.statSync(newPath);
    if (oldStats.size !== newStats.size) {
      return false;
    }
  }

  return true;
}

function rollbackMigration(newDir) {
  if (!fs.existsSync(newDir)) {
    return;
  }
  fs.rmSync(newDir, { recursive: true, force: true });
}

function createBackupDir(oldDir) {
  const backupName = `${BACKUP_PREFIX}${formatDate(new Date())}`;
  const backupDir = path.join(getClaudeDir(), backupName);
  if (!fs.existsSync(backupDir)) {
    copyDirectory(oldDir, backupDir);
  }
  return backupDir;
}

function performMigration(options = {}) {
  const oldDir = getLegacyAppDir();
  const newDir = getNewAppDir();
  if (!fs.existsSync(oldDir)) {
    return { status: 'no-legacy' };
  }

  if (fs.existsSync(newDir) && fs.existsSync(getMigrationCompletePath())) {
    return { status: 'already-migrated' };
  }

  migrationInProgress = true;
  try {
    logMigration('开始配置迁移');
    checkPermissions(getClaudeDir());
    checkDiskSpace();

    createBackupDir(oldDir);
    ensureDir(newDir);
    writeMigrationStatus('in-progress');

    const totalFiles = copyDirectory(oldDir, newDir, (current, total) => {
      if (options.onProgress) {
        options.onProgress(current, total);
      }
    });

    const verified = verifyMigration(oldDir, newDir);
    if (!verified) {
      throw new Error('迁移校验失败');
    }

    writeMigrationCompleteFlag();
    writeMigrationStatus('completed', { files: totalFiles });
    logMigration('配置迁移完成');

    return { status: 'completed', files: totalFiles };
  } catch (error) {
    logMigrationError(error);
    writeMigrationStatus('failed', { error: error.message });
    rollbackMigration(newDir);
    return { status: 'failed', error };
  } finally {
    migrationInProgress = false;
  }
}

function migrateIfNeeded(options = {}) {
  if (migrationInProgress) {
    return { status: 'in-progress' };
  }

  const oldDir = getLegacyAppDir();
  const newDir = getNewAppDir();
  const oldExists = fs.existsSync(oldDir);
  const newExists = fs.existsSync(newDir);
  const status = readMigrationStatus();

  if (newExists && fs.existsSync(getMigrationCompletePath())) {
    return { status: 'already-migrated' };
  }

  if (newExists && status?.status === 'in-progress' && oldExists) {
    const verified = verifyMigration(oldDir, newDir);
    if (verified) {
      writeMigrationCompleteFlag();
      writeMigrationStatus('completed');
      return { status: 'completed' };
    }
    rollbackMigration(newDir);
  }

  if (!oldExists) {
    return { status: 'no-legacy' };
  }

  if (newExists && verifyMigration(oldDir, newDir)) {
    writeMigrationCompleteFlag();
    writeMigrationStatus('completed');
    return { status: 'completed' };
  }

  if (options.async) {
    setImmediate(() => {
      performMigration(options);
    });
    return { status: 'queued' };
  }

  return performMigration(options);
}

function triggerBackgroundMigration() {
  return migrateIfNeeded({ async: true });
}

function getAppDir() {
  const newDir = getNewAppDir();
  if (fs.existsSync(newDir)) {
    return newDir;
  }

  const legacyDir = getLegacyAppDir();
  if (fs.existsSync(legacyDir)) {
    triggerBackgroundMigration();
    return legacyDir;
  }

  return newDir;
}

function getChannelsPath() {
  return path.join(getAppDir(), 'channels.json');
}

function getStatsPath() {
  return path.join(getAppDir(), 'stats');
}

function getBackupPath(type) {
  let baseDir = getClaudeDir();
  let newName = `${type || 'config'}.${APP_DIR_NAME}-backup`;
  let legacyName = `${type || 'config'}.${LEGACY_DIR_NAME}-backup`;

  switch (type) {
    case 'claude-settings':
      newName = 'settings.json.cctoolbox-backup';
      legacyName = 'settings.json.cc-tool-backup';
      break;
    case 'gemini-env':
      baseDir = getGeminiDir();
      newName = '.env.cctoolbox-backup';
      legacyName = '.env.cc-tool-backup';
      break;
    case 'gemini-settings':
      baseDir = getGeminiDir();
      newName = 'settings.json.cctoolbox-backup';
      legacyName = 'settings.json.cc-tool-backup';
      break;
    case 'codex-config':
      baseDir = getCodexDir();
      newName = 'config.toml.cctoolbox-backup';
      legacyName = 'config.toml.cc-tool-backup';
      break;
    case 'codex-auth':
      baseDir = getCodexDir();
      newName = 'auth.json.cctoolbox-backup';
      legacyName = 'auth.json.cc-tool-backup';
      break;
    default:
      break;
  }

  const newPath = path.join(baseDir, newName);
  const legacyPath = path.join(baseDir, legacyName);

  if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
    return legacyPath;
  }
  return newPath;
}

function getLogFile(type) {
  const logNameMap = {
    ui: { newName: 'cctoolbox-out.log', legacyName: 'cc-tool-out.log' },
    out: { newName: 'cctoolbox-out.log', legacyName: 'cc-tool-out.log' },
    error: { newName: 'cctoolbox-error.log', legacyName: 'cc-tool-error.log' },
    claude: { newName: 'claude-proxy.log', legacyName: 'claude-proxy.log' },
    codex: { newName: 'codex-proxy.log', legacyName: 'codex-proxy.log' },
    gemini: { newName: 'gemini-proxy.log', legacyName: 'gemini-proxy.log' }
  };

  const names = logNameMap[type] || {
    newName: `${APP_DIR_NAME}-${type}.log`,
    legacyName: `${LEGACY_DIR_NAME}-${type}.log`
  };
  const logDir = path.join(getClaudeDir(), 'logs');

  const newPath = path.join(logDir, names.newName);
  const legacyPath = path.join(logDir, names.legacyName);

  if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
    return legacyPath;
  }
  return newPath;
}

module.exports = {
  getAppDir,
  getLegacyAppDir,
  getChannelsPath,
  getStatsPath,
  getBackupPath,
  getLogFile,
  migrateIfNeeded,
  performMigration,
  verifyMigration,
  rollbackMigration
};
