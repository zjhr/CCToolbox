const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DEFAULT_IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);
const MAX_REFERENCE_RESULTS = 200;
const MAX_REFERENCE_FILE_SIZE = 1024 * 1024;
const symbolCache = new Map();

function createSerenaError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function getSerenaBase(projectPath) {
  return path.resolve(projectPath, '.serena');
}

function getProjectConfigPath(projectPath) {
  const baseDir = getSerenaBase(projectPath);
  const ymlPath = path.join(baseDir, 'project.yml');
  const yamlPath = path.join(baseDir, 'project.yaml');
  if (fs.existsSync(ymlPath)) return ymlPath;
  if (fs.existsSync(yamlPath)) return yamlPath;
  return ymlPath;
}

function ensureSerenaDir(projectPath) {
  const baseDir = getSerenaBase(projectPath);
  if (!fs.existsSync(baseDir)) {
    throw createSerenaError('SERENA_NOT_CONFIGURED', 'Serena MCP 服务未配置', 404);
  }
  return baseDir;
}

function normalizeMemoryName(name) {
  const normalized = String(name || '').trim();
  if (!normalized) {
    throw createSerenaError('INVALID_MEMORY_NAME', '记忆名称不能为空', 400);
  }
  const base = path.basename(normalized);
  if (base !== normalized || !/^[a-zA-Z0-9._-]+$/.test(base)) {
    throw createSerenaError('INVALID_MEMORY_NAME', '记忆名称格式不合法', 400);
  }
  return base.replace(/\.md$/i, '');
}

function getMemoriesDir(projectPath) {
  return path.join(getSerenaBase(projectPath), 'memories');
}

function readYamlConfig(raw = '') {
  const result = {
    projectName: '',
    languages: [],
    language: '',
    encoding: '',
    readOnly: false,
    ignore: [],
    raw: raw || ''
  };

  const lines = (raw || '').split(/\r?\n/);
  let currentListKey = '';

  const mapKey = (key) => {
    const normalized = key.trim();
    if (['project_name', 'project', 'name'].includes(normalized)) return 'projectName';
    if (['languages', 'language', 'lang'].includes(normalized)) return normalized === 'languages' ? 'languages' : 'language';
    if (['encoding', 'charset'].includes(normalized)) return 'encoding';
    if (['read_only', 'readonly', 'readOnly'].includes(normalized)) return 'readOnly';
    if (['ignore', 'ignored', 'exclude', 'ignored_paths', 'ignored_dirs'].includes(normalized)) return 'ignore';
    return '';
  };

  const parseValue = (value) => {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    return trimmed.replace(/^['"]|['"]$/g, '');
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const listMatch = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*$/);
    if (listMatch) {
      const key = mapKey(listMatch[2]);
      currentListKey = key;
      if (key && !Array.isArray(result[key])) {
        result[key] = [];
      }
      return;
    }

    const kvMatch = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (kvMatch) {
      const key = mapKey(kvMatch[2]);
      currentListKey = '';
      if (!key) return;
      const value = parseValue(kvMatch[3]);
      if ((key === 'languages' || key === 'ignore') && Array.isArray(value)) {
        result[key] = value;
      } else {
        result[key] = value;
      }
      return;
    }

    const listItemMatch = line.match(/^\s*-\s*(.+)$/);
    if (listItemMatch && (currentListKey === 'ignore' || currentListKey === 'languages')) {
      result[currentListKey].push(parseValue(listItemMatch[1]));
    }
  });

  return result;
}

function formatYamlConfig(config) {
  const lines = [];
  if (config.projectName) lines.push(`project_name: ${config.projectName}`);
  if (config.language) lines.push(`language: ${config.language}`);
  if (config.encoding) lines.push(`encoding: ${config.encoding}`);
  lines.push(`read_only: ${config.readOnly ? 'true' : 'false'}`);

  const ignoreList = Array.isArray(config.ignore) ? config.ignore : [];
  lines.push('ignore:');
  if (ignoreList.length === 0) {
    lines.push('  - node_modules/**');
  } else {
    ignoreList.forEach(item => {
      lines.push(`  - ${item}`);
    });
  }
  return lines.join('\n') + '\n';
}

function checkHealth(projectPath) {
  const baseDir = getSerenaBase(projectPath);
  if (!fs.existsSync(baseDir)) {
    return {
      hasSerena: false,
      message: '未检测到 .serena 目录'
    };
  }
  const configPath = getProjectConfigPath(projectPath);
  const hasConfig = fs.existsSync(configPath);
  return {
    hasSerena: true,
    hasConfig,
    configPath,
    message: hasConfig ? '配置已就绪' : '缺少 project.yml'
  };
}

function listMemories(projectPath, options = {}) {
  ensureSerenaDir(projectPath);
  const memoriesDir = getMemoriesDir(projectPath);
  if (!fs.existsSync(memoriesDir)) {
    return [];
  }
  const query = String(options.query || '').trim().toLowerCase();
  const entries = fs.readdirSync(memoriesDir, { withFileTypes: true });
  const items = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => {
      const fullPath = path.join(memoriesDir, entry.name);
      const stats = fs.statSync(fullPath);
      const name = entry.name.replace(/\.md$/i, '');
      let matched = true;
      if (query) {
        const lowerName = name.toLowerCase();
        if (!lowerName.includes(query)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          matched = content.toLowerCase().includes(query);
        }
      }
      return {
        name,
        path: entry.name,
        size: stats.size,
        mtime: stats.mtimeMs,
        matched
      };
    })
    .filter(item => (query ? item.matched : true))
    .map(({ matched, ...rest }) => rest)
    .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

  return items;
}

function readMemory(projectPath, name) {
  ensureSerenaDir(projectPath);
  const memoriesDir = getMemoriesDir(projectPath);
  const safeName = normalizeMemoryName(name);
  const fullPath = path.join(memoriesDir, `${safeName}.md`);
  if (!fs.existsSync(fullPath)) {
    throw createSerenaError('MEMORY_NOT_FOUND', '记忆文件不存在', 404);
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const stats = fs.statSync(fullPath);
  return {
    name: safeName,
    path: `${safeName}.md`,
    content,
    size: stats.size,
    mtime: stats.mtimeMs
  };
}

function writeMemory(projectPath, name, content) {
  ensureSerenaDir(projectPath);
  const memoriesDir = getMemoriesDir(projectPath);
  const safeName = normalizeMemoryName(name);
  if (!fs.existsSync(memoriesDir)) {
    fs.mkdirSync(memoriesDir, { recursive: true });
  }
  const fullPath = path.join(memoriesDir, `${safeName}.md`);
  fs.writeFileSync(fullPath, content || '', 'utf8');
  const stats = fs.statSync(fullPath);
  return {
    name: safeName,
    path: `${safeName}.md`,
    size: stats.size,
    mtime: stats.mtimeMs
  };
}

function deleteMemory(projectPath, name) {
  ensureSerenaDir(projectPath);
  const memoriesDir = getMemoriesDir(projectPath);
  const safeName = normalizeMemoryName(name);
  const fullPath = path.join(memoriesDir, `${safeName}.md`);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  fs.unlinkSync(fullPath);
  return { name: safeName, removed: true };
}

function batchDeleteMemories(projectPath, names = []) {
  ensureSerenaDir(projectPath);
  const results = [];
  const uniqueNames = Array.from(new Set(names));
  uniqueNames.forEach((name) => {
    try {
      results.push(deleteMemory(projectPath, name));
    } catch (error) {
      results.push({ name, removed: false, error: error.message });
    }
  });
  return results;
}

function getOverview(projectPath) {
  ensureSerenaDir(projectPath);
  const configPath = getProjectConfigPath(projectPath);
  const configRaw = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const config = readYamlConfig(configRaw);
  const memories = listMemories(projectPath);
  const fileCount = countProjectFiles(projectPath);

  return {
    hasSerena: true,
    projectName: config.projectName || path.basename(projectPath),
    projectPath,
    language: config.language || (Array.isArray(config.languages) && config.languages.length > 0 ? config.languages[0] : 'unknown'),
    encoding: config.encoding || 'utf-8',
    readOnly: Boolean(config.readOnly),
    memoryCount: memories.length,
    fileCount,
    updatedAt: Date.now(),
    structure: listProjectStructure(projectPath)
  };
}

function listProjectStructure(projectPath) {
  const maxDepth = 2;

  const build = (dirPath, depth, prefix = '') => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes = entries
      .filter(entry => !DEFAULT_IGNORE_DIRS.has(entry.name) && entry.name !== '.serena')
      .map(entry => {
        const fullPath = path.join(dirPath, entry.name);
        const stats = fs.statSync(fullPath);
        const relPath = prefix ? path.join(prefix, entry.name) : entry.name;
        const node = {
          key: relPath,
          name: entry.name,
          path: relPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          mtime: stats.mtimeMs
        };
        if (entry.isDirectory() && depth < maxDepth) {
          node.children = build(fullPath, depth + 1, relPath);
        }
        return node;
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
    return nodes;
  };

  return build(projectPath, 1);
}

function countProjectFiles(projectPath) {
  let count = 0;
  const queue = [projectPath];
  const maxCount = 5000;

  while (queue.length) {
    const current = queue.pop();
    if (!current) break;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name) || entry.name === '.serena') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else {
        count += 1;
        if (count >= maxCount) return count;
      }
    }
  }
  return count;
}

function getSettings(projectPath) {
  ensureSerenaDir(projectPath);
  const configPath = getProjectConfigPath(projectPath);
  const raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const config = readYamlConfig(raw);
  return {
    ...config,
    path: configPath
  };
}

function saveSettings(projectPath, config = {}) {
  ensureSerenaDir(projectPath);
  const configPath = getProjectConfigPath(projectPath);
  const payload = {
    projectName: config.projectName || '',
    language: config.language || '',
    encoding: config.encoding || '',
    readOnly: Boolean(config.readOnly),
    ignore: Array.isArray(config.ignore) ? config.ignore.filter(Boolean) : []
  };
  const raw = formatYamlConfig(payload);
  fs.writeFileSync(configPath, raw, 'utf8');
  return {
    ...payload,
    raw,
    path: configPath
  };
}

function findLatestPkl(projectPath) {
  const cacheDir = path.join(getSerenaBase(projectPath), 'cache');
  if (!fs.existsSync(cacheDir)) {
    return { path: '', mtime: null };
  }
  let latestPath = '';
  let latestMtime = 0;
  const stack = [cacheDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach(entry => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }
      if (entry.isFile() && entry.name === 'document_symbols.pkl') {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestPath = fullPath;
        }
      }
    });
  }
  if (!latestPath) {
    return { path: '', mtime: null };
  }
  return { path: latestPath, mtime: latestMtime };
}

function getCacheStatus(projectPath) {
  ensureSerenaDir(projectPath);
  const { path: cachePath, mtime } = findLatestPkl(projectPath);
  if (!cachePath) {
    return { exists: false, path: '', mtime: null };
  }
  return {
    exists: true,
    path: path.relative(projectPath, cachePath).split(path.sep).join('/'),
    mtime
  };
}

function parseSerenaCache(projectPath) {
  const scriptPath = path.resolve(__dirname, '../../../scripts/parse_serena_pkl.py');
  const args = [scriptPath, '--project', projectPath];

  const execWith = (command) => new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        return reject(err);
      }
      try {
        const data = JSON.parse(stdout || '{}');
        resolve(data);
      } catch (parseError) {
        parseError.message = `解析 Serena 缓存失败: ${parseError.message}`;
        reject(parseError);
      }
    });
  });

  return execWith('python3').catch((error) => {
    if (error.code === 'ENOENT') {
      return execWith('python');
    }
    throw error;
  });
}

async function loadSymbolCache(projectPath) {
  const status = getCacheStatus(projectPath);
  if (!status.exists) {
    symbolCache.delete(projectPath);
    return {
      status,
      data: {
        files: [],
        symbols: {},
        fileCount: 0
      }
    };
  }
  const cached = symbolCache.get(projectPath);
  if (cached && cached.mtime === status.mtime && cached.path === status.path) {
    return { status, data: cached.data };
  }
  try {
    const data = await parseSerenaCache(projectPath);
    const normalized = {
      files: Array.isArray(data.files) ? data.files : [],
      symbols: data.symbols || {},
      fileCount: data.fileCount || 0
    };
    symbolCache.set(projectPath, {
      path: status.path,
      mtime: status.mtime,
      data: normalized
    });
    return { status, data: normalized };
  } catch (error) {
    if (cached) {
      return { status: { ...status, error: error.message }, data: cached.data };
    }
    throw error;
  }
}

async function getFiles(projectPath) {
  ensureSerenaDir(projectPath);
  const { data } = await loadSymbolCache(projectPath);
  const files = Array.isArray(data.files) ? data.files : [];
  return files;
}

async function getSymbols(projectPath, options = {}) {
  ensureSerenaDir(projectPath);
  const { data } = await loadSymbolCache(projectPath);
  const symbols = data.symbols || {};
  const filePath = options.filePath || '';
  const query = options.query || '';

  if (filePath) {
    const list = Array.isArray(symbols[filePath]) ? symbols[filePath] : [];
    if (query) {
      return list.filter(item => String(item.name || '').toLowerCase().includes(query.toLowerCase()));
    }
    return list;
  }

  if (!query) return symbols;
  const results = [];
  Object.keys(symbols).forEach((file) => {
    const list = Array.isArray(symbols[file]) ? symbols[file] : [];
    list.forEach((item) => {
      if (String(item.name || '').toLowerCase().includes(query.toLowerCase())) {
        results.push({ ...item, file });
      }
    });
  });
  return results;
}

async function getSymbolReferences(projectPath, symbolName) {
  ensureSerenaDir(projectPath);
  if (!symbolName) {
    return [];
  }
  const baseDir = path.resolve(projectPath);
  const files = collectFiles(baseDir);
  const keyword = String(symbolName);
  const results = [];

  for (const filePath of files) {
    if (results.length >= MAX_REFERENCE_RESULTS) break;
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_REFERENCE_FILE_SIZE) continue;
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      continue;
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (results.length >= MAX_REFERENCE_RESULTS) return;
      const column = line.indexOf(keyword);
      if (column >= 0) {
        results.push({
          file: path.relative(baseDir, filePath).split(path.sep).join('/'),
          line: index + 1,
          column: column + 1,
          preview: line.trim()
        });
      }
    });
  }

  return results;
}

function collectFiles(baseDir) {
  const results = [];
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach(entry => {
      if (DEFAULT_IGNORE_DIRS.has(entry.name) || entry.name === '.serena') return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        results.push(fullPath);
      }
    });
  };
  walk(baseDir);
  return results;
}

module.exports = {
  createSerenaError,
  checkHealth,
  getCacheStatus,
  getOverview,
  listMemories,
  readMemory,
  writeMemory,
  deleteMemory,
  batchDeleteMemories,
  getSettings,
  saveSettings,
  getFiles,
  getSymbols,
  getSymbolReferences
};
