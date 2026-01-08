const fs = require('fs');
const path = require('path');
const os = require('os');
const { getAppDir } = require('../../utils/app-path-manager');
const { execFileSync, execFile } = require('child_process');
const chokidar = require('chokidar');
const { createTwoFilesPatch } = require('diff');
const { createEtag } = require('../utils/etag');
const { broadcastOpenSpecChange } = require('../websocket-server');

const LARGE_FILE_SIZE = 500 * 1024;
function getOpenSpecSettingsPath() {
  const appDir = getAppDir();
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return path.join(appDir, 'openspec-settings.json');
}
const CLI_CONFIG_PATH = path.join(os.homedir(), '.config', 'openspec', 'config.json');
const OPENSPEC_PACKAGE = '@fission-ai/openspec';
function getNpmCachePath() {
  const appDir = getAppDir();
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return path.join(appDir, 'npm-cache');
}
const CLI_CACHE_TTL = 60 * 1000;
const CHANGE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
let cliInfoCache = null;

const SUPPORTED_TOOLS = [
  {
    id: 'amazon-q',
    name: 'Amazon Q Developer',
    scope: 'project',
    paths: [
      '.amazonq/prompts/openspec-proposal.md',
      '.amazonq/prompts/openspec-apply.md',
      '.amazonq/prompts/openspec-archive.md'
    ]
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    scope: 'project',
    paths: [
      '.agent/workflows/openspec-proposal.md',
      '.agent/workflows/openspec-apply.md',
      '.agent/workflows/openspec-archive.md'
    ]
  },
  {
    id: 'auggie',
    name: 'Auggie (Augment CLI)',
    scope: 'project',
    paths: [
      '.augment/commands/openspec-proposal.md',
      '.augment/commands/openspec-apply.md',
      '.augment/commands/openspec-archive.md'
    ]
  },
  {
    id: 'claude',
    name: 'Claude Code',
    scope: 'project',
    paths: [
      '.claude/commands/openspec/proposal.md',
      '.claude/commands/openspec/apply.md',
      '.claude/commands/openspec/archive.md'
    ]
  },
  {
    id: 'cline',
    name: 'Cline',
    scope: 'project',
    paths: [
      '.clinerules/workflows/openspec-proposal.md',
      '.clinerules/workflows/openspec-apply.md',
      '.clinerules/workflows/openspec-archive.md'
    ]
  },
  {
    id: 'codex',
    name: 'Codex',
    scope: 'codex',
    paths: [
      'prompts/openspec-proposal.md',
      'prompts/openspec-apply.md',
      'prompts/openspec-archive.md'
    ]
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy Code (CLI)',
    scope: 'project',
    paths: [
      '.codebuddy/commands/openspec/proposal.md',
      '.codebuddy/commands/openspec/apply.md',
      '.codebuddy/commands/openspec/archive.md'
    ]
  },
  {
    id: 'costrict',
    name: 'CoStrict',
    scope: 'project',
    paths: [
      '.cospec/openspec/commands/openspec-proposal.md',
      '.cospec/openspec/commands/openspec-apply.md',
      '.cospec/openspec/commands/openspec-archive.md'
    ]
  },
  {
    id: 'crush',
    name: 'Crush',
    scope: 'project',
    paths: [
      '.crush/commands/openspec/proposal.md',
      '.crush/commands/openspec/apply.md',
      '.crush/commands/openspec/archive.md'
    ]
  },
  {
    id: 'cursor',
    name: 'Cursor',
    scope: 'project',
    paths: [
      '.cursor/commands/openspec-proposal.md',
      '.cursor/commands/openspec-apply.md',
      '.cursor/commands/openspec-archive.md'
    ]
  },
  {
    id: 'factory',
    name: 'Factory Droid',
    scope: 'project',
    paths: [
      '.factory/commands/openspec-proposal.md',
      '.factory/commands/openspec-apply.md',
      '.factory/commands/openspec-archive.md'
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    scope: 'project',
    paths: [
      '.gemini/commands/openspec/proposal.toml',
      '.gemini/commands/openspec/apply.toml',
      '.gemini/commands/openspec/archive.toml'
    ]
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    scope: 'project',
    paths: [
      '.github/prompts/openspec-proposal.prompt.md',
      '.github/prompts/openspec-apply.prompt.md',
      '.github/prompts/openspec-archive.prompt.md'
    ]
  },
  {
    id: 'iflow',
    name: 'iFlow',
    scope: 'project',
    paths: [
      '.iflow/commands/openspec-proposal.md',
      '.iflow/commands/openspec-apply.md',
      '.iflow/commands/openspec-archive.md'
    ]
  },
  {
    id: 'kilocode',
    name: 'Kilo Code',
    scope: 'project',
    paths: [
      '.kilocode/workflows/openspec-proposal.md',
      '.kilocode/workflows/openspec-apply.md',
      '.kilocode/workflows/openspec-archive.md'
    ]
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    scope: 'project',
    paths: [
      '.opencode/command/openspec-proposal.md',
      '.opencode/command/openspec-apply.md',
      '.opencode/command/openspec-archive.md'
    ]
  },
  {
    id: 'qoder',
    name: 'Qoder (CLI)',
    scope: 'project',
    paths: [
      '.qoder/commands/openspec/proposal.md',
      '.qoder/commands/openspec/apply.md',
      '.qoder/commands/openspec/archive.md'
    ]
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    scope: 'project',
    paths: [
      '.qwen/commands/openspec-proposal.toml',
      '.qwen/commands/openspec-apply.toml',
      '.qwen/commands/openspec-archive.toml'
    ]
  },
  {
    id: 'roocode',
    name: 'RooCode',
    scope: 'project',
    paths: [
      '.roo/commands/openspec-proposal.md',
      '.roo/commands/openspec-apply.md',
      '.roo/commands/openspec-archive.md'
    ]
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    scope: 'project',
    paths: [
      '.windsurf/workflows/openspec-proposal.md',
      '.windsurf/workflows/openspec-apply.md',
      '.windsurf/workflows/openspec-archive.md'
    ]
  },
  {
    id: 'agents',
    name: 'AGENTS.md (works with Amp, VS Code, …)',
    scope: 'project',
    paths: [
      'openspec/AGENTS.md',
      'AGENTS.md'
    ]
  }
];

const watchers = new Map();
const snapshots = new Map();

function getOpenSpecBase(projectPath) {
  return path.resolve(projectPath, 'openspec');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getSnapshotMap(projectPath) {
  if (!snapshots.has(projectPath)) {
    snapshots.set(projectPath, new Map());
  }
  return snapshots.get(projectPath);
}

function normalizeRelPath(baseDir, fullPath) {
  return path.relative(baseDir, fullPath).split(path.sep).join('/');
}

function normalizeChangePath(changePath) {
  if (typeof changePath !== 'string' || !changePath.trim()) {
    throw new Error('缺少变更路径');
  }
  const normalized = changePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (segments.includes('..')) {
    throw new Error('变更路径不合法');
  }
  if (!normalized.startsWith('changes/')) {
    throw new Error('只能删除 changes 下的变更');
  }
  if (normalized === 'changes' || normalized === 'changes/') {
    throw new Error('变更路径不合法');
  }
  if (normalized.startsWith('changes/archive')) {
    throw new Error('不允许删除归档变更');
  }
  return normalized;
}

function buildTree(baseDir, relativeDir = '') {
  const targetDir = path.join(baseDir, relativeDir);
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const nodes = entries.map(entry => {
    const fullPath = path.join(targetDir, entry.name);
    const relPath = normalizeRelPath(baseDir, fullPath);
    const stats = fs.statSync(fullPath);
    const node = {
      name: entry.name,
      path: relPath,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      mtime: stats.mtimeMs
    };

    if (entry.isDirectory()) {
      node.children = buildTree(baseDir, relPath);
    }

    return node;
  });

  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return (b.mtime || 0) - (a.mtime || 0);
  });
}

function markTemporaryNodes(nodes, changeId, changePath) {
  return (nodes || []).map((node) => {
    const next = {
      ...node,
      isTemporary: true,
      changeId,
      changePath
    };
    if (node.children) {
      next.children = markTemporaryNodes(node.children, changeId, changePath);
    }
    return next;
  });
}

function buildTemporarySpecs(baseDir) {
  const changesDir = path.join(baseDir, 'changes');
  if (!fs.existsSync(changesDir)) {
    return [];
  }

  const entries = fs.readdirSync(changesDir, { withFileTypes: true });
  const items = [];
  entries.forEach((entry) => {
    if (!entry.isDirectory()) {
      return;
    }
    if (entry.name === 'archive') {
      return;
    }
    if (!CHANGE_ID_PATTERN.test(entry.name)) {
      return;
    }
    const specsDir = path.join(changesDir, entry.name, 'specs');
    if (!fs.existsSync(specsDir)) {
      return;
    }
    const stats = fs.statSync(specsDir);
    if (!stats.isDirectory()) {
      return;
    }
    const relativeSpecsDir = normalizeRelPath(baseDir, specsDir);
    const nodes = buildTree(baseDir, relativeSpecsDir);
    if (nodes.length) {
      items.push(...markTemporaryNodes(nodes, entry.name, `changes/${entry.name}`));
    }
  });

  return items;
}

function listFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursive(fullPath);
    }
    return [fullPath];
  });
}

function computeDashboard(projectPath) {
  const baseDir = getOpenSpecBase(projectPath);
  if (!fs.existsSync(baseDir)) {
    return {
      hasOpenSpec: false,
      specCount: 0,
      changeCount: 0,
      archiveCount: 0,
      lastUpdated: null
    };
  }

  const specsDir = path.join(baseDir, 'specs');
  const changesDir = path.join(baseDir, 'changes');
  const archivesDir = path.join(changesDir, 'archive');

  const specFiles = listFilesRecursive(specsDir).filter(file => file.endsWith('.md'));
  const changeDirs = fs.existsSync(changesDir)
    ? fs.readdirSync(changesDir, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== 'archive')
    : [];
  const archiveDirs = fs.existsSync(archivesDir)
    ? fs.readdirSync(archivesDir, { withFileTypes: true }).filter(entry => entry.isDirectory())
    : [];

  const allFiles = listFilesRecursive(baseDir);
  const lastUpdated = allFiles.length
    ? Math.max(...allFiles.map(file => fs.statSync(file).mtimeMs))
    : null;

  return {
    hasOpenSpec: true,
    specCount: specFiles.length,
    changeCount: changeDirs.length,
    archiveCount: archiveDirs.length,
    lastUpdated
  };
}

function readProjectFiles(projectPath) {
  const baseDir = getOpenSpecBase(projectPath);
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  const targets = ['AGENTS.md', 'project.md'].map(name => path.join(baseDir, name));
  return targets.filter(file => fs.existsSync(file)).map(file => {
    const stats = fs.statSync(file);
    return {
      name: path.basename(file),
      path: normalizeRelPath(baseDir, file),
      type: 'file',
      size: stats.size,
      mtime: stats.mtimeMs
    };
  });
}

function getCodexHome() {
  const envPath = process.env.CODEX_HOME && process.env.CODEX_HOME.trim();
  if (envPath) {
    return envPath;
  }
  return path.join(os.homedir(), '.codex');
}

function resolveToolPaths(tool, projectPath) {
  if (!tool.paths || tool.paths.length === 0) {
    return [];
  }
  let baseDir = projectPath;
  if (tool.scope === 'codex') {
    baseDir = getCodexHome();
  }
  return tool.paths.map(relPath => path.resolve(baseDir, relPath));
}

function getSupportedTools(projectPath) {
  return SUPPORTED_TOOLS.map(tool => {
    const resolvedPaths = resolveToolPaths(tool, projectPath);
    const installed = resolvedPaths.some(targetPath => fs.existsSync(targetPath));
    return {
      id: tool.id,
      name: tool.name,
      installed
    };
  });
}

function getInstalledVersion() {
  try {
    const output = execFileSync('openspec', ['--version'], {
      encoding: 'utf8',
      timeout: 4000
    });
    return output.trim();
  } catch (err) {
    return null;
  }
}

function getLatestVersion() {
  try {
    const cachePath = getNpmCachePath();
    ensureDir(cachePath);
    const output = execFileSync('npm', ['view', OPENSPEC_PACKAGE, 'version', '--cache', cachePath], {
      encoding: 'utf8',
      timeout: 6000
    });
    return output.trim();
  } catch (err) {
    return null;
  }
}

function getCliInfo() {
  if (cliInfoCache && (Date.now() - cliInfoCache.timestamp) < CLI_CACHE_TTL) {
    return cliInfoCache.data;
  }
  const data = {
    packageName: OPENSPEC_PACKAGE,
    installedVersion: getInstalledVersion(),
    latestVersion: getLatestVersion()
  };
  cliInfoCache = {
    timestamp: Date.now(),
    data
  };
  return data;
}

function initTools(projectPath, tools) {
  const toolList = Array.isArray(tools)
    ? tools.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const uniqueTools = Array.from(new Set(toolList));
  if (uniqueTools.length === 0) {
    const err = new Error('缺少工具列表');
    err.statusCode = 400;
    throw err;
  }
  const args = ['init', '--tools', uniqueTools.join(',')];
  return new Promise((resolve, reject) => {
    execFile('openspec', args, { cwd: projectPath, encoding: 'utf8', timeout: 20000 }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({
        command: `openspec ${args.join(' ')}`,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim()
      });
    });
  });
}

function readSettings(projectPath) {
  const defaults = buildDefaultSettings(projectPath);
  try {
    const settingsPath = getOpenSpecSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return defaults;
    }
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const stored = parsed[projectPath] || {};
    return {
      ...defaults,
      ...stored,
      cliConfigPath: defaults.cliConfigPath
    };
  } catch (err) {
    return defaults;
  }
}

function buildDefaultSettings(projectPath) {
  return {
    projectPath,
    autoRefresh: true,
    refreshInterval: 15000,
    aiTool: 'claude',
    cliConfigPath: CLI_CONFIG_PATH
  };
}

function saveSettings(projectPath, settings) {
  const settingsPath = getOpenSpecSettingsPath();
  ensureDir(path.dirname(settingsPath));
  let data = {};
  if (fs.existsSync(settingsPath)) {
    try {
      data = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
    } catch (err) {
      data = {};
    }
  }
  const defaults = buildDefaultSettings(projectPath);
  data[projectPath] = {
    projectPath,
    autoRefresh: settings?.autoRefresh ?? defaults.autoRefresh,
    refreshInterval: settings?.refreshInterval ?? defaults.refreshInterval,
    aiTool: settings?.aiTool ?? defaults.aiTool,
    cliConfigPath: defaults.cliConfigPath
  };
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
  return data[projectPath];
}

function readFile(projectPath, relativePath) {
  const baseDir = getOpenSpecBase(projectPath);
  const targetPath = path.join(baseDir, relativePath);
  if (!fs.existsSync(targetPath)) {
    throw new Error('文件不存在');
  }
  const content = fs.readFileSync(targetPath, 'utf8');
  const size = Buffer.byteLength(content, 'utf8');
  const isLarge = size > LARGE_FILE_SIZE;
  const etag = createEtag(content);

  const snapshot = getSnapshotMap(projectPath);
  snapshot.set(relativePath, content);

  return {
    content,
    etag,
    size,
    isLarge
  };
}

function writeFile(projectPath, relativePath, content, etag) {
  const baseDir = getOpenSpecBase(projectPath);
  const targetPath = path.join(baseDir, relativePath);
  const exists = fs.existsSync(targetPath);
  const currentContent = exists ? fs.readFileSync(targetPath, 'utf8') : '';
  const currentEtag = createEtag(currentContent);

  if (exists && etag && etag !== currentEtag) {
    return {
      conflict: true,
      current: currentContent,
      etag: currentEtag
    };
  }

  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content, 'utf8');

  const newEtag = createEtag(content);
  const snapshot = getSnapshotMap(projectPath);
  snapshot.set(relativePath, content);

  return {
    content,
    etag: newEtag,
    size: Buffer.byteLength(content, 'utf8'),
    isLarge: Buffer.byteLength(content, 'utf8') > LARGE_FILE_SIZE
  };
}

function buildDiff(oldContent, newContent, relativePath) {
  return createTwoFilesPatch(relativePath, relativePath, oldContent, newContent, '', '');
}

function getDiff(projectPath, relativePath) {
  const baseDir = getOpenSpecBase(projectPath);
  const targetPath = path.join(baseDir, relativePath);
  if (!fs.existsSync(targetPath)) {
    return null;
  }

  const snapshot = getSnapshotMap(projectPath);
  const previous = snapshot.get(relativePath) || '';
  const current = fs.readFileSync(targetPath, 'utf8');

  const diff = buildDiff(previous, current, relativePath);
  snapshot.set(relativePath, current);

  return diff;
}

function resolveConflict(projectPath, relativePath, resolution, content) {
  if (resolution === 'remote') {
    return readFile(projectPath, relativePath);
  }

  if (typeof content !== 'string') {
    throw new Error('缺少合并后的内容');
  }

  const baseDir = getOpenSpecBase(projectPath);
  const targetPath = path.join(baseDir, relativePath);
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content, 'utf8');
  const etag = createEtag(content);
  const snapshot = getSnapshotMap(projectPath);
  snapshot.set(relativePath, content);

  return {
    content,
    etag,
    size: Buffer.byteLength(content, 'utf8'),
    isLarge: Buffer.byteLength(content, 'utf8') > LARGE_FILE_SIZE
  };
}

function deleteChange(projectPath, changePath) {
  const baseDir = getOpenSpecBase(projectPath);
  const normalized = normalizeChangePath(changePath);
  const targetPath = path.resolve(baseDir, normalized);
  if (targetPath === baseDir || !targetPath.startsWith(baseDir + path.sep)) {
    throw new Error('非法路径访问');
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error('变更路径不存在');
  }
  const stats = fs.statSync(targetPath);
  if (!stats.isDirectory()) {
    throw new Error('变更路径必须为目录');
  }
  const proposalPath = path.join(targetPath, 'proposal.md');
  if (!fs.existsSync(proposalPath) || !fs.statSync(proposalPath).isFile()) {
    throw new Error('变更缺少 proposal.md，禁止删除');
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  return { path: normalized };
}

function ensureWatcher(projectPath) {
  if (watchers.has(projectPath)) {
    return;
  }

  const baseDir = getOpenSpecBase(projectPath);
  if (!fs.existsSync(baseDir)) {
    return;
  }

  const watcher = chokidar.watch(baseDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  });

  const snapshot = getSnapshotMap(projectPath);

  function handleChange(event, filePath) {
    const relPath = normalizeRelPath(baseDir, filePath);
    if (event === 'unlink') {
      snapshot.delete(relPath);
      broadcastOpenSpecChange({
        projectPath,
        path: relPath,
        event: 'unlink'
      });
      return;
    }

    if (!fs.existsSync(filePath)) {
      return;
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const size = Buffer.byteLength(content, 'utf8');
    const isLarge = size > LARGE_FILE_SIZE;
    const previous = snapshot.get(relPath) || '';
    const diff = buildDiff(previous, content, relPath);
    const etag = createEtag(content);

    snapshot.set(relPath, content);

    broadcastOpenSpecChange({
      projectPath,
      path: relPath,
      event,
      diff,
      etag,
      size,
      isLarge,
      content: isLarge ? null : content
    });
  }

  watcher.on('add', filePath => handleChange('add', filePath));
  watcher.on('change', filePath => handleChange('change', filePath));
  watcher.on('unlink', filePath => handleChange('unlink', filePath));

  watchers.set(projectPath, watcher);
}

module.exports = {
  computeDashboard,
  readProjectFiles,
  buildTree,
  buildTemporarySpecs,
  getSupportedTools,
  getCliInfo,
  initTools,
  readSettings,
  saveSettings,
  readFile,
  writeFile,
  getDiff,
  resolveConflict,
  deleteChange,
  ensureWatcher
};
