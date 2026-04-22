const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { getAllSessions, parseSessionInfoFast } = require('../../utils/session');
const { getAppDir } = require('../../utils/app-path-manager');
const { loadAliases, deleteAlias } = require('./alias');
const { getAllMetadata } = require('./session-metadata');
const { buildMessageCounts } = require('./message-counts');
const {
  getCachedProjects,
  setCachedProjects,
  invalidateProjectsCache,
  checkHasMessagesCache,
  rememberHasMessages
} = require('./session-cache');
const { broadcastSessionUpdate } = require('../websocket-server');

const SESSION_LIST_CACHE_TTL_MS = 30 * 1000;
const SESSION_LIST_CACHE_MAX_ENTRIES = 100;

/**
 * 将工具返回内容统一序列化为字符串，避免内容类型不一致导致展示异常。
 * @param {*} value 任意内容
 * @returns {string}
 */
function stringifyMessagePayload(value) {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(value ?? '');
  }
}

/**
 * 统一归一化消息 content，支持文本、工具调用、工具结果、思考块等结构。
 * @param {string|Array|*} value 原始消息 content
 * @param {object} options 归一化选项
 * @returns {string}
 */
function normalizeMessageContent(value, options = {}) {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return '';
  }

  const {
    includeAnyTextField = false,
    includeInputText = false,
    includeToolResult = true,
    includeToolResultName = false,
    includeToolUse = false,
    toolUseUnknownName = null,
    includeExtendedToolName = true,
    includeThinking = false,
    requireThinkingTrim = false,
    includeImagePlaceholder = false,
    joinWith = '\n\n',
    emptyFallback = ''
  } = options;

  const parts = [];
  value
    .filter((item) => item && typeof item === 'object')
    .forEach((item) => {
      if (item.type === 'text' && typeof item.text === 'string') {
        parts.push(item.text);
        return;
      }

      if (includeAnyTextField && typeof item.text === 'string') {
        parts.push(item.text);
        return;
      }

      if (includeInputText && typeof item.input_text === 'string') {
        parts.push(item.input_text);
        return;
      }

      if (includeToolResult && item.type === 'tool_result') {
        const resultContent = stringifyMessagePayload(item.content);
        const toolName = includeExtendedToolName
          ? (item.name || item.tool_name || item.toolName || null)
          : (item.name || null);
        if (includeToolResultName && toolName) {
          parts.push(`**[工具结果: ${toolName}]**\n\`\`\`\n${resultContent}\n\`\`\``);
        } else {
          parts.push(`**[工具结果]**\n\`\`\`\n${resultContent}\n\`\`\``);
        }
        return;
      }

      if (includeToolUse && item.type === 'tool_use') {
        const inputStr = stringifyMessagePayload(item.input);
        const toolName = includeExtendedToolName
          ? (item.name || item.tool_name || item.toolName || toolUseUnknownName)
          : (item.name || toolUseUnknownName);
        parts.push(`**[调用工具: ${toolName}]**\n\`\`\`json\n${inputStr}\n\`\`\``);
        return;
      }

      if (includeThinking && item.type === 'thinking' && typeof item.thinking === 'string') {
        if (!requireThinkingTrim || item.thinking.trim()) {
          parts.push(`**[思考]**\n${item.thinking}`);
        }
        return;
      }

      if (includeImagePlaceholder && item.type === 'image') {
        parts.push('[图片]');
      }
    });

  if (parts.length === 0) {
    return emptyFallback;
  }

  return parts.join(joinWith);
}

/**
 * 将 Gemini 原生 parts 结构转换为统一 content 结构，便于复用共享归一化逻辑。
 * @param {Array|*} value 原始 Gemini parts
 * @returns {Array<object>}
 */
function normalizeGeminiContentParts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      if (typeof item.type === 'string') {
        return item;
      }

      if (typeof item.text === 'string') {
        return { type: 'text', text: item.text };
      }

      if (item.functionCall && typeof item.functionCall === 'object') {
        return {
          type: 'tool_use',
          name: item.functionCall.name || null,
          input: item.functionCall.args ?? {}
        };
      }

      if (item.functionResponse && typeof item.functionResponse === 'object') {
        return {
          type: 'tool_result',
          name: item.functionResponse.name || null,
          content: item.functionResponse.response
        };
      }

      return item;
    });
}

const SESSION_UPDATE_NORMALIZE_OPTIONS = Object.freeze({
  includeAnyTextField: true,
  includeInputText: true,
  includeToolResult: true,
  includeToolResultName: true,
  includeToolUse: true,
  toolUseUnknownName: 'unknown',
  includeThinking: true,
  requireThinkingTrim: true
});

const GEMINI_SESSION_UPDATE_NORMALIZE_OPTIONS = Object.freeze({
  includeAnyTextField: true,
  includeToolResult: true,
  includeToolResultName: true,
  includeToolUse: true,
  toolUseUnknownName: 'unknown',
  includeThinking: true,
  requireThinkingTrim: true,
  joinWith: '\n'
});

/**
 * 统一会话增量消息 content 的归一化路径。
 * - Claude/Codex: 直接走 normalizeMessageContent
 * - Gemini: 先执行 parts 预处理，再走 normalizeMessageContent
 * @param {*} value 原始 content
 * @param {object} options 归一化控制项
 * @returns {string}
 */
function normalizeSessionUpdateContent(value, options = {}) {
  const {
    preprocessGeminiParts = false,
    trim = false,
    normalizeOptions = SESSION_UPDATE_NORMALIZE_OPTIONS
  } = options;

  const normalizedInput = preprocessGeminiParts ? normalizeGeminiContentParts(value) : value;
  const normalizedContent = normalizeMessageContent(normalizedInput, normalizeOptions);
  return trim ? normalizedContent.trim() : normalizedContent;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegExp(pattern) {
  if (pattern instanceof RegExp) {
    return pattern;
  }
  const source = String(pattern || '')
    .split('*')
    .map(escapeRegExp)
    .join('.*');
  return new RegExp(`^${source}$`);
}

class SessionListCache {
  constructor(options = {}) {
    this.maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : SESSION_LIST_CACHE_MAX_ENTRIES;
    this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : SESSION_LIST_CACHE_TTL_MS;
    this.store = new Map();
  }

  get(key) {
    const cacheKey = String(key);
    const entry = this.store.get(cacheKey);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(cacheKey);
      return null;
    }

    // LRU: 访问后移动到末尾
    this.store.delete(cacheKey);
    this.store.set(cacheKey, entry);
    return entry.value;
  }

  set(key, value) {
    const cacheKey = String(key);
    const entry = {
      value,
      expiresAt: Date.now() + this.ttlMs
    };

    if (this.store.has(cacheKey)) {
      this.store.delete(cacheKey);
    }

    this.store.set(cacheKey, entry);
    this.evictIfNeeded();
  }

  invalidate(pattern = null) {
    if (!pattern) {
      const removed = this.store.size;
      this.store.clear();
      return removed;
    }

    const matcher = wildcardToRegExp(pattern);
    let removed = 0;
    for (const cacheKey of Array.from(this.store.keys())) {
      if (matcher.test(cacheKey)) {
        this.store.delete(cacheKey);
        removed += 1;
      }
    }
    return removed;
  }

  clear() {
    const removed = this.store.size;
    this.store.clear();
    return removed;
  }

  size() {
    return this.store.size;
  }

  evictIfNeeded() {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.store.delete(oldestKey);
    }
  }
}

class MinHeap {
  constructor(compareFn) {
    this.compareFn = compareFn;
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  peek() {
    return this.items[0] || null;
  }

  push(value) {
    this.items.push(value);
    this.bubbleUp(this.items.length - 1);
  }

  replaceTop(value) {
    if (this.items.length === 0) {
      this.items[0] = value;
      return;
    }
    this.items[0] = value;
    this.bubbleDown(0);
  }

  toArray() {
    return [...this.items];
  }

  bubbleUp(index) {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compareFn(this.items[current], this.items[parent]) >= 0) {
        break;
      }
      [this.items[current], this.items[parent]] = [this.items[parent], this.items[current]];
      current = parent;
    }
  }

  bubbleDown(index) {
    let current = index;
    const length = this.items.length;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let next = current;

      if (left < length && this.compareFn(this.items[left], this.items[next]) < 0) {
        next = left;
      }
      if (right < length && this.compareFn(this.items[right], this.items[next]) < 0) {
        next = right;
      }
      if (next === current) {
        break;
      }
      [this.items[current], this.items[next]] = [this.items[next], this.items[current]];
      current = next;
    }
  }
}

function getSessionListCacheKey(channel, limit) {
  const safeChannel = channel || 'claude';
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  return `${safeChannel}:${safeLimit}`;
}

const sessionListCache = new SessionListCache();

function getSessionListCache() {
  return sessionListCache;
}

// Base directory for CCToolbox data
function getCcToolDir() {
  return getAppDir();
}

// Get path for storing project order
function getOrderFilePath() {
  return path.join(getCcToolDir(), 'project-order.json');
}

// Get path for storing fork relations
function getForkRelationsFilePath() {
  return path.join(getCcToolDir(), 'fork-relations.json');
}

// Get path for storing session order
function getSessionOrderFilePath() {
  return path.join(getCcToolDir(), 'session-order.json');
}

// Get saved project order
function getProjectOrder(config) {
  const orderFile = getOrderFilePath();
  try {
    if (fs.existsSync(orderFile)) {
      const data = fs.readFileSync(orderFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    // Ignore errors
  }
  return [];
}

// Save project order
function saveProjectOrder(config, order) {
  const orderFile = getOrderFilePath();
  const dir = path.dirname(orderFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(orderFile, JSON.stringify(order, null, 2), 'utf8');
  invalidateProjectsCache(config);
}

// Get fork relations
function getForkRelations() {
  const relationsFile = getForkRelationsFilePath();
  try {
    if (fs.existsSync(relationsFile)) {
      const data = fs.readFileSync(relationsFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    // Ignore errors
  }
  return {};
}

// Save fork relations
function saveForkRelations(relations) {
  const relationsFile = getForkRelationsFilePath();
  const dir = path.dirname(relationsFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(relationsFile, JSON.stringify(relations, null, 2), 'utf8');
}

// Get all projects with stats
function getProjects(config) {
  const projectsDir = config.projectsDir;

  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

// Parse real project path from encoded name
// macOS/Linux: "-Users-lilithgames-work-project" -> "/Users/lilithgames/work/project"
// Windows: "C--Users-admin-Desktop-project" -> "C:\Users\admin\Desktop\project"
function parseRealProjectPath(encodedName) {
  const isWindows = process.platform === 'win32';
  const fallbackFromSessions = tryResolvePathFromSessions(encodedName);

  // Detect Windows drive letter (e.g., "C--Users-admin")
  const windowsDriveMatch = encodedName.match(/^([A-Z])--(.+)$/);

  if (isWindows && windowsDriveMatch) {
    // Windows path with drive letter
    const driveLetter = windowsDriveMatch[1];
    const restPath = windowsDriveMatch[2];

    // Split by '-' to get segments
    const segments = restPath.split('-').filter(s => s);

    // Build path from left to right, checking existence
    let realSegments = [];
    let accumulated = '';
    let currentPath = '';

    for (let i = 0; i < segments.length; i++) {
      if (accumulated) {
        accumulated += '-' + segments[i];
      } else {
        accumulated = segments[i];
      }

      const testPath = driveLetter + ':\\' + realSegments.concat(accumulated).join('\\');

      // Check if this path exists
      let found = fs.existsSync(testPath);
      let finalAccumulated = accumulated;

      // If not found with dash, try with underscore
      if (!found && accumulated.includes('-')) {
        const withUnderscore = accumulated.replace(/-/g, '_');
        const testPathUnderscore = driveLetter + ':\\' + realSegments.concat(withUnderscore).join('\\');
        if (fs.existsSync(testPathUnderscore)) {
          finalAccumulated = withUnderscore;
          found = true;
        }
      }

      if (found) {
        realSegments.push(finalAccumulated);
        accumulated = '';
        currentPath = driveLetter + ':\\' + realSegments.join('\\');
      }
    }

    // If there's remaining accumulated segment, try underscore variant
    if (accumulated) {
      let finalAccumulated = accumulated;
      if (accumulated.includes('-')) {
        const withUnderscore = accumulated.replace(/-/g, '_');
        const testPath = driveLetter + ':\\' + realSegments.concat(withUnderscore).join('\\');
        if (fs.existsSync(testPath)) {
          finalAccumulated = withUnderscore;
        }
      }
      realSegments.push(finalAccumulated);
      currentPath = driveLetter + ':\\' + realSegments.join('\\');
    }

    return {
      fullPath: validateProjectPath(currentPath) || fallbackFromSessions?.fullPath || (driveLetter + ':\\' + restPath.replace(/-/g, '\\')),
      projectName: fallbackFromSessions?.projectName || realSegments[realSegments.length - 1] || encodedName
    };
  } else {
    // Unix-like path (macOS/Linux) or fallback
    const pathStr = encodedName.replace(/^-/, '/').replace(/-/g, '/');
    const segments = pathStr.split('/').filter(s => s);

    // Build path from left to right, checking existence
    let currentPath = '';
    const realSegments = [];
    let accumulated = '';

    for (let i = 0; i < segments.length; i++) {
      if (accumulated) {
        accumulated += '-' + segments[i];
      } else {
        accumulated = segments[i];
      }

      const testPath = '/' + realSegments.concat(accumulated).join('/');

      // Check if this path exists
      let found = fs.existsSync(testPath);
      let finalAccumulated = accumulated;

      // If not found with dash, try with underscore
      if (!found && accumulated.includes('-')) {
        const withUnderscore = accumulated.replace(/-/g, '_');
        const testPathUnderscore = '/' + realSegments.concat(withUnderscore).join('/');
        if (fs.existsSync(testPathUnderscore)) {
          finalAccumulated = withUnderscore;
          found = true;
        }
      }

      if (found) {
        realSegments.push(finalAccumulated);
        accumulated = '';
        currentPath = '/' + realSegments.join('/');
      }
    }

    // If there's remaining accumulated segment, try underscore variant
    if (accumulated) {
      let finalAccumulated = accumulated;
      if (accumulated.includes('-')) {
        const withUnderscore = accumulated.replace(/-/g, '_');
        const testPath = '/' + realSegments.concat(withUnderscore).join('/');
        if (fs.existsSync(testPath)) {
          finalAccumulated = withUnderscore;
        }
      }
      realSegments.push(finalAccumulated);
      currentPath = '/' + realSegments.join('/');
    }

    return {
      fullPath: validateProjectPath(currentPath) || fallbackFromSessions?.fullPath || pathStr,
      projectName: fallbackFromSessions?.projectName || realSegments[realSegments.length - 1] || encodedName
    };
  }
}

function validateProjectPath(candidatePath) {
  if (candidatePath && fs.existsSync(candidatePath)) {
    return candidatePath;
  }
  return null;
}

function tryResolvePathFromSessions(encodedName) {
  try {
    const projectDir = path.join(os.homedir(), '.claude', 'projects', encodedName);
    if (!fs.existsSync(projectDir)) {
      return null;
    }
    const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      const sessionFile = path.join(projectDir, file);
      const cwd = extractCwdFromSessionHeader(sessionFile);
      if (cwd && fs.existsSync(cwd)) {
        return {
          fullPath: cwd,
          projectName: path.basename(cwd)
        };
      }
    }
  } catch (err) {
    // ignore fallback errors
  }
  return null;
}

function extractCwdFromSessionHeader(sessionFile) {
  try {
    const fd = fs.openSync(sessionFile, 'r');
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);
    const content = buffer.slice(0, bytesRead).toString('utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.cwd && typeof json.cwd === 'string') {
          return json.cwd;
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    // ignore
  }
  return null;
}

// Get projects with detailed stats (with caching)
function getProjectsWithStats(config, options = {}) {
  if (!options.force) {
    const cached = getCachedProjects(config);
    if (cached) {
      return cached;
    }
  }

  const data = buildProjectsWithStats(config);
  setCachedProjects(config, data);
  return data;
}

function buildProjectsWithStats(config) {
  const projectsDir = config.projectsDir;

  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const projectName = entry.name;
      const projectPath = path.join(projectsDir, projectName);

      // Parse real project path
      const { fullPath, projectName: displayName } = parseRealProjectPath(projectName);

      // Get session files (only count sessions with actual messages)
      let sessionCount = 0;
      let lastUsed = null;

      try {
        const files = fs.readdirSync(projectPath);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

        // Filter: only count sessions that have actual messages (not just file-history-snapshots)
        const sessionFilesWithMessages = jsonlFiles.filter(f => {
          const filePath = path.join(projectPath, f);
          return hasActualMessages(filePath);
        });

        sessionCount = sessionFilesWithMessages.length;

        // Find most recent session (only from sessions with messages)
        if (sessionFilesWithMessages.length > 0) {
          const stats = sessionFilesWithMessages.map(f => {
            const filePath = path.join(projectPath, f);
            const stat = fs.statSync(filePath);
            return stat.mtime.getTime();
          });
          lastUsed = Math.max(...stats);
        }
      } catch (err) {
        // Ignore errors
      }

      // Get project directory creation time
      let createdAt = null;
      try {
        const stats = fs.statSync(projectPath);
        createdAt = stats.birthtime.getTime();
      } catch (err) {
        // Ignore errors
      }

      return {
        name: projectName, // Keep encoded name for API operations
        displayName, // Project name for display
        fullPath, // Real full path for display
        sessionCount,
        lastUsed,
        createdAt
      };
    })
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)); // Sort by last used
}

// 获取 Claude 项目/会话数量（轻量统计）
function getProjectAndSessionCounts(config) {
  const projectsDir = config.projectsDir;
  if (!fs.existsSync(projectsDir)) {
    return { projectCount: 0, sessionCount: 0 };
  }

  let projectCount = 0;
  let sessionCount = 0;

  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  entries.forEach((entry) => {
    if (!entry.isDirectory()) {
      return;
    }
    projectCount += 1;
    const projectPath = path.join(projectsDir, entry.name);
    try {
      const files = fs.readdirSync(projectPath);
      sessionCount += files.filter(file => file.endsWith('.jsonl') && !file.startsWith('agent-')).length;
    } catch (err) {
      // 忽略单个项目的读取错误
    }
  });

  return { projectCount, sessionCount };
}

// Check if a session file has actual messages (not just file-history-snapshots)
function hasActualMessages(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const cached = checkHasMessagesCache(filePath, stats);
    if (typeof cached === 'boolean') {
      return cached;
    }

    const result = scanSessionFileForMessages(filePath);
    rememberHasMessages(filePath, stats, result);
    return result;
  } catch (err) {
    return false;
  }
}

function scanSessionFileForMessages(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const bufferSize = 64 * 1024;
    const buffer = Buffer.alloc(bufferSize);
    const pattern = /"type"\s*:\s*"(user|assistant|summary)"/;
    let leftover = '';
    let bytesRead;

    while ((bytesRead = fs.readSync(fd, buffer, 0, bufferSize, null)) > 0) {
      const chunk = buffer.toString('utf8', 0, bytesRead);
      const combined = leftover + chunk;
      if (pattern.test(combined)) {
        fs.closeSync(fd);
        return true;
      }
      leftover = combined.slice(-64);
    }

    fs.closeSync(fd);
    return false;
  } catch (err) {
    if (fd) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        // ignore
      }
    }
    return false;
  }
}

function extractProgressEntry(json) {
  const data = json?.data || {};
  const agentId = data.agentId || data.agent_id || json?.agentId || json?.agent_id || null;
  const prompt = data.prompt || data.input?.prompt || json?.prompt || null;
  const subagentType = data.subagentType || data.subagent_type || data.agentType || json?.subagentType || null;
  const toolName = data.tool || data.toolName || data.name || data.tool_name || json?.toolName || null;
  const slug = data.slug || json?.slug || null;
  if (!agentId && !prompt && !subagentType && !toolName && !slug) return null;
  return {
    timestamp: json?.timestamp || null,
    agentId,
    prompt,
    subagentType,
    toolName,
    slug,
    raw: data
  };
}

// Get sessions for a project
function getSessionsForProject(config, projectName) {
  const projectConfig = { ...config, currentProject: projectName };
  const sessions = getAllSessions(projectConfig);
  const forkRelations = getForkRelations();
  const savedOrder = getSessionOrder(projectName);

  // Parse session info and calculate total size, filter out sessions with no messages
  let totalSize = 0;
  const sessionsWithInfo = sessions
    .filter(session => hasActualMessages(session.filePath))
    .map(session => {
      const info = parseSessionInfoFast(session.filePath);
      totalSize += session.size || 0;
      return {
        sessionId: session.sessionId,
        mtime: session.mtime,
        size: session.size,
        filePath: session.filePath,
        gitBranch: info.gitBranch || null,
        firstMessage: info.firstMessage || null,
        forkedFrom: forkRelations[session.sessionId] || null
      };
    });

  // Apply saved order if exists
  let orderedSessions = sessionsWithInfo;
  if (savedOrder.length > 0) {
    const ordered = [];
    const sessionMap = new Map(sessionsWithInfo.map(s => [s.sessionId, s]));

    // Add sessions in saved order
    for (const sessionId of savedOrder) {
      if (sessionMap.has(sessionId)) {
        ordered.push(sessionMap.get(sessionId));
        sessionMap.delete(sessionId);
      }
    }

    // Add remaining sessions (new ones not in saved order)
    ordered.push(...sessionMap.values());
    orderedSessions = ordered;
  }

  return {
    sessions: orderedSessions,
    totalSize
  };
}

async function getSubagentMessages(projectName, sessionId, agentId, options = {}) {
  const pageNum = parseInt(options.page || 1);
  const limitNum = parseInt(options.pageSize || options.limit || 20);
  const order = options.order || 'desc';

  const { fullPath } = parseRealProjectPath(projectName);
  const possiblePaths = [
    path.join(fullPath, '.claude', 'sessions', sessionId, 'subagents', `agent-${agentId}.jsonl`),
    path.join(os.homedir(), '.claude', 'projects', projectName, sessionId, 'subagents', `agent-${agentId}.jsonl`)
  ];

  let subagentFile = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      subagentFile = testPath;
      break;
    }
  }

  if (!subagentFile) {
    const error = new Error('Subagent not found');
    error.code = 'SUBAGENT_NOT_FOUND';
    error.triedPaths = possiblePaths;
    throw error;
  }

  const allMessages = [];
  const metadata = {};
  const progressEntries = [];

  const stream = fs.createReadStream(subagentFile, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);

        if (json.type === 'summary' && json.summary) {
          metadata.summary = json.summary;
        }
        if (json.gitBranch) {
          metadata.gitBranch = json.gitBranch;
        }
        if (json.cwd) {
          metadata.cwd = json.cwd;
        }

        if (json.type === 'progress') {
          const progressEntry = extractProgressEntry(json);
          if (progressEntry) {
            progressEntries.push(progressEntry);
          }
          continue;
        }

        if (json.type === 'user' || json.type === 'assistant') {
          const message = {
            type: json.type,
            content: null,
            timestamp: json.timestamp || null,
            model: json.model || null,
            agentId: json.agentId || json.agent_id || json?.data?.agentId || null,
            slug: json.slug || json?.data?.slug || null
          };

          if (json.type === 'user') {
            if (typeof json.message?.content === 'string') {
              message.content = json.message.content;
            } else if (Array.isArray(json.message?.content)) {
              message.content = normalizeMessageContent(json.message.content, {
                includeToolResult: true,
                includeImagePlaceholder: true,
                emptyFallback: '[工具交互]'
              });
            }
          } else if (json.type === 'assistant') {
            if (Array.isArray(json.message?.content)) {
              message.content = normalizeMessageContent(json.message.content, {
                includeToolUse: true,
                includeExtendedToolName: false,
                includeThinking: true,
                emptyFallback: '[处理中...]'
              });
            } else if (typeof json.message?.content === 'string') {
              message.content = json.message.content;
            }
          }

          if (message.content && message.content !== 'Warmup') {
            allMessages.push(message);
          }
        }
      } catch (err) {
        // Skip invalid lines
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (progressEntries.length > 0) {
    metadata.progress = progressEntries;
  }

  if (order === 'desc') {
    allMessages.reverse();
  }

  const total = allMessages.length;
  const messageCounts = buildMessageCounts(allMessages);
  const startIndex = (pageNum - 1) * limitNum;
  const endIndex = startIndex + limitNum;
  const messages = allMessages.slice(startIndex, endIndex);
  const hasMore = endIndex < total;

  return {
    messages,
    metadata,
    messageCounts,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      hasMore
    }
  };
}

// Delete a session
function deleteSession(config, projectName, sessionId) {
  const projectDir = path.join(config.projectsDir, projectName);
  const sessionFile = path.join(projectDir, sessionId + '.jsonl');

  if (!fs.existsSync(sessionFile)) {
    throw new Error('Session not found');
  }

  fs.unlinkSync(sessionFile);
  cleanupSessionRelations(sessionId);
  invalidateProjectsCache(config);
  return { success: true };
}

// Fork a session
function forkSession(config, projectName, sessionId) {
  const projectDir = path.join(config.projectsDir, projectName);
  const sessionFile = path.join(projectDir, sessionId + '.jsonl');

  if (!fs.existsSync(sessionFile)) {
    throw new Error('Session not found');
  }

  // Read the original session
  const content = fs.readFileSync(sessionFile, 'utf8');

  // Generate new session ID (UUID v4)
  const newSessionId = crypto.randomUUID();
  const newSessionFile = path.join(projectDir, newSessionId + '.jsonl');

  // Write to new file
  fs.writeFileSync(newSessionFile, content, 'utf8');

  // Save fork relation
  const forkRelations = getForkRelations();
  forkRelations[newSessionId] = sessionId;
  saveForkRelations(forkRelations);
  invalidateProjectsCache(config);

  return { newSessionId, forkedFrom: sessionId };
}

// Get session order for a project
function getSessionOrder(projectName) {
  const orderFile = getSessionOrderFilePath();
  try {
    if (fs.existsSync(orderFile)) {
      const data = fs.readFileSync(orderFile, 'utf8');
      const allOrders = JSON.parse(data);
      return allOrders[projectName] || [];
    }
  } catch (err) {
    // Ignore errors
  }
  return [];
}

// Save session order for a project
function saveSessionOrder(projectName, order) {
  const orderFile = getSessionOrderFilePath();
  const dir = path.dirname(orderFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Read existing orders
  let allOrders = {};
  try {
    if (fs.existsSync(orderFile)) {
      const data = fs.readFileSync(orderFile, 'utf8');
      allOrders = JSON.parse(data);
    }
  } catch (err) {
    // Ignore errors
  }

  // Update order for this project
  allOrders[projectName] = order;
  fs.writeFileSync(orderFile, JSON.stringify(allOrders, null, 2), 'utf8');
}

// Delete a project (remove the entire project directory)
function deleteProject(config, projectName) {
  const projectDir = path.join(config.projectsDir, projectName);

  if (!fs.existsSync(projectDir)) {
    throw new Error('Project not found');
  }

  // Recursively delete the directory
  fs.rmSync(projectDir, { recursive: true, force: true });

  // Remove from order file if exists
  const order = getProjectOrder(config);
  const newOrder = order.filter(name => name !== projectName);
  if (newOrder.length !== order.length) {
    saveProjectOrder(config, newOrder);
  }

  invalidateProjectsCache(config);
  return { success: true };
}

function parseTagKeyword(keyword) {
  if (!keyword) return null;
  const trimmed = keyword.trim();
  if (!trimmed.toLowerCase().startsWith('tag:')) return null;
  const tagPart = trimmed.slice(4).trim();
  if (!tagPart) return '';
  return tagPart.split(/\s+/)[0];
}

function searchSessionsByTag(config, projectName, tagKeyword) {
  const projectDir = path.join(config.projectsDir, projectName);

  if (!fs.existsSync(projectDir)) {
    return [];
  }

  const results = [];
  const files = fs.readdirSync(projectDir);
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
  const aliases = loadAliases();
  const allMetadata = getAllMetadata();
  const lowerKeyword = tagKeyword.toLowerCase();

  for (const file of jsonlFiles) {
    const sessionId = file.replace('.jsonl', '');
    const filePath = path.join(projectDir, file);

    if (!hasActualMessages(filePath)) {
      continue;
    }

    const metadata = allMetadata[sessionId] || {};
    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    const matchedTags = tags.filter(tag => String(tag).toLowerCase().includes(lowerKeyword));

    if (matchedTags.length > 0) {
      results.push({
        sessionId,
        alias: aliases[sessionId] || null,
        matchCount: matchedTags.length,
        matches: matchedTags.slice(0, 5).map(tag => ({
          role: 'tag',
          context: `tag:${tag}`,
          position: 0
        })),
        mtime: fs.statSync(filePath).mtime.toISOString()
      });
    }
  }

  results.sort((a, b) => b.matchCount - a.matchCount);

  return results;
}

// Search sessions for keyword
function searchSessions(config, projectName, keyword, contextLength = 15) {
  const tagKeyword = parseTagKeyword(keyword);
  if (tagKeyword !== null) {
    if (!tagKeyword) return [];
    return searchSessionsByTag(config, projectName, tagKeyword);
  }

  const projectDir = path.join(config.projectsDir, projectName);

  if (!fs.existsSync(projectDir)) {
    return [];
  }

  const results = [];
  const files = fs.readdirSync(projectDir);
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
  const aliases = loadAliases();

  for (const file of jsonlFiles) {
    const sessionId = file.replace('.jsonl', '');
    const filePath = path.join(projectDir, file);

    // Skip sessions with no actual messages
    if (!hasActualMessages(filePath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const matches = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const json = JSON.parse(line);

          // Search in message content
          if (json.message && json.message.content) {
            const text = json.message.content;
            const lowerText = text.toLowerCase();
            const lowerKeyword = keyword.toLowerCase();
            let index = 0;

            while ((index = lowerText.indexOf(lowerKeyword, index)) !== -1) {
              // Extract context
              const start = Math.max(0, index - contextLength);
              const end = Math.min(text.length, index + keyword.length + contextLength);
              const context = text.substring(start, end);

              matches.push({
                role: json.message.role || 'unknown',
                context: (start > 0 ? '...' : '') + context + (end < text.length ? '...' : ''),
                position: index
              });

              index += keyword.length;
            }
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }

      if (matches.length > 0) {
        results.push({
          sessionId,
          alias: aliases[sessionId] || null,
          matchCount: matches.length,
          matches: matches.slice(0, 5), // Limit to 5 matches per session
          mtime: fs.statSync(filePath).mtime.toISOString()
        });
      }
    } catch (e) {
      // Skip files that can't be read
    }
  }

  // Sort by match count
  results.sort((a, b) => b.matchCount - a.matchCount);

  return results;
}

// Get recent sessions across all projects
function getRecentSessions(config, limit = 5) {
  const projects = getProjects(config);
  const allSessions = [];
  const forkRelations = getForkRelations();
  const aliases = loadAliases();

  // Collect all sessions from all projects
  projects.forEach(projectName => {
    const projectConfig = { ...config, currentProject: projectName };
    const sessions = getAllSessions(projectConfig);
    const { projectName: displayName, fullPath } = parseRealProjectPath(projectName);

    sessions.forEach(session => {
      // Skip sessions with no actual messages
      if (!hasActualMessages(session.filePath)) {
        return;
      }

      const info = parseSessionInfoFast(session.filePath);
      allSessions.push({
        sessionId: session.sessionId,
        projectName: projectName,
        projectDisplayName: displayName,
        projectFullPath: fullPath,
        mtime: session.mtime,
        size: session.size,
        filePath: session.filePath,
        gitBranch: info.gitBranch || null,
        firstMessage: info.firstMessage || null,
        forkedFrom: forkRelations[session.sessionId] || null,
        alias: aliases[session.sessionId] || null
      });
    });
  });

  // Sort by mtime descending (most recent first)
  allSessions.sort((a, b) => b.mtime - a.mtime);

  // Return top N sessions
  return allSessions.slice(0, limit);
}

async function getRecentSessionsOptimized(config, limit = 5) {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
  const projects = getProjects(config);
  if (projects.length === 0) {
    return [];
  }

  const minHeap = new MinHeap((a, b) => a.mtimeMs - b.mtimeMs);
  const promisesFs = fs.promises;

  await Promise.all(projects.map(async (projectName) => {
    const projectDir = path.join(config.projectsDir, projectName);
    let entries;

    try {
      entries = await promisesFs.readdir(projectDir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[Sessions] Failed to read project dir "${projectName}":`, err.message);
      return;
    }

    const { projectName: displayName, fullPath } = parseRealProjectPath(projectName);
    const sessionFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('.jsonl') && !entry.name.startsWith('agent-'));

    await Promise.all(sessionFiles.map(async (entry) => {
      const sessionId = entry.name.replace(/\.jsonl$/, '');
      const filePath = path.join(projectDir, entry.name);
      try {
        const stats = await promisesFs.stat(filePath);
        if (!stats.isFile()) {
          return;
        }

        // 仅将包含真实消息的会话纳入 Top-K，避免最终结果条数不足
        if (!hasActualMessages(filePath)) {
          return;
        }

        const candidate = {
          sessionId,
          projectName,
          projectDisplayName: displayName,
          projectFullPath: fullPath,
          filePath,
          size: stats.size,
          mtime: stats.mtime,
          mtimeMs: stats.mtimeMs
        };

        if (minHeap.size() < safeLimit) {
          minHeap.push(candidate);
          return;
        }

        const oldest = minHeap.peek();
        if (oldest && candidate.mtimeMs > oldest.mtimeMs) {
          minHeap.replaceTop(candidate);
        }
      } catch (err) {
        // 忽略单个文件 stat 异常，继续处理剩余会话
      }
    }));
  }));

  const aliases = loadAliases();
  const forkRelations = getForkRelations();
  const candidates = minHeap.toArray().sort((a, b) => b.mtimeMs - a.mtimeMs);
  const sessions = [];

  for (const candidate of candidates) {
    const info = parseSessionInfoFast(candidate.filePath);
    sessions.push({
      sessionId: candidate.sessionId,
      projectName: candidate.projectName,
      projectDisplayName: candidate.projectDisplayName,
      projectFullPath: candidate.projectFullPath,
      mtime: candidate.mtime,
      size: candidate.size,
      filePath: candidate.filePath,
      gitBranch: info.gitBranch || null,
      firstMessage: info.firstMessage || null,
      forkedFrom: forkRelations[candidate.sessionId] || null,
      alias: aliases[candidate.sessionId] || null
    });
  }

  return sessions.slice(0, safeLimit);
}

// Search sessions across all projects
function searchSessionsAcrossProjects(config, keyword, contextLength = 35) {
  const projects = getProjects(config);
  const allResults = [];

  projects.forEach(projectName => {
    const projectResults = searchSessions(config, projectName, keyword, contextLength);
    const { projectName: displayName, fullPath } = parseRealProjectPath(projectName);

    // Add project info to each result
    projectResults.forEach(result => {
      allResults.push({
        ...result,
        projectName: projectName,
        projectDisplayName: displayName,
        projectFullPath: fullPath
      });
    });
  });

  // Sort by match count
  allResults.sort((a, b) => b.matchCount - a.matchCount);

  return allResults;
}

// 清理会话关联数据：别名、Fork 关系、排序
function cleanupSessionRelations(sessionId) {
  if (!sessionId) return;

  // 清理 fork 关系
  const forkRelations = getForkRelations();
  let forkRelationsModified = false;

  if (forkRelations[sessionId]) {
    delete forkRelations[sessionId];
    forkRelationsModified = true;
  }

  Object.keys(forkRelations).forEach(key => {
    if (forkRelations[key] === sessionId) {
      delete forkRelations[key];
      forkRelationsModified = true;
    }
  });

  if (forkRelationsModified) {
    saveForkRelations(forkRelations);
  }

  // 清理别名
  try {
    deleteAlias(sessionId);
  } catch (err) {
    // 忽略别名不存在或读取失败
  }

  // 清理会话排序
  const orderFile = getSessionOrderFilePath();
  if (!fs.existsSync(orderFile)) {
    return;
  }

  try {
    const raw = fs.readFileSync(orderFile, 'utf8');
    const allOrders = JSON.parse(raw) || {};
    let orderModified = false;

    Object.keys(allOrders).forEach(projectKey => {
      const order = Array.isArray(allOrders[projectKey]) ? allOrders[projectKey] : [];
      const filtered = order.filter(id => id !== sessionId);
      if (filtered.length !== order.length) {
        allOrders[projectKey] = filtered;
        orderModified = true;
      }
    });

    if (orderModified) {
      fs.writeFileSync(orderFile, JSON.stringify(allOrders, null, 2), 'utf8');
    }
  } catch (err) {
    // 忽略排序文件异常
  }
}

const sessionWatchers = new Map();

function resolveWatchChannel(options = {}) {
  if (options && typeof options === 'object' && typeof options.channel === 'string') {
    const normalizedChannel = options.channel.trim().toLowerCase();
    if (normalizedChannel) {
      return normalizedChannel;
    }
  }
  return 'claude';
}

function resolveWatchProjectName(options = {}) {
  return typeof options === 'string' ? options : options.projectName;
}

function resolveSessionWatchFilePath(sessionId, options = {}) {
  const channel = resolveWatchChannel(options);
  const projectName = resolveWatchProjectName(options);
  const fileName = `${sessionId}.jsonl`;
  console.log(`[resolveSessionWatchFilePath] sessionId=${sessionId}, channel=${channel}, projectName=${projectName}`);

  if (channel === 'codex') {
    console.log(`[resolveSessionWatchFilePath] codex branch: looking up session ${sessionId}`);
    try {
      const codexSessions = require('./codex-sessions');
      const session = codexSessions.getSessionById(sessionId);
      console.log('[resolveSessionWatchFilePath] codex session found:', session ? {
        filePath: session.filePath,
        exists: session.filePath ? fs.existsSync(session.filePath) : false
      } : 'NOT FOUND');
      if (session?.filePath && fs.existsSync(session.filePath)) {
        return session.filePath;
      }
    } catch (err) {
      // 忽略 codex session 查询异常，继续 fallback
    }
  }

  if (channel === 'gemini') {
    try {
      const geminiSessions = require('./gemini-sessions');
      const session = geminiSessions.getSessionById(sessionId);
      if (session?.filePath && fs.existsSync(session.filePath)) {
        return session.filePath;
      }
    } catch (err) {
      // 忽略 gemini session 查询异常，继续 fallback
    }
  }

  if (!projectName) {
    return path.join(getAppDir(), fileName);
  }

  try {
    const { fullPath } = parseRealProjectPath(projectName);
    const projectPath = path.join(fullPath, '.claude', 'sessions', fileName);
    if (fs.existsSync(projectPath)) {
      return projectPath;
    }
  } catch (err) {
    // 忽略路径解析异常，继续 fallback
  }

  const homePath = path.join(os.homedir(), '.claude', 'projects', projectName, fileName);
  if (fs.existsSync(homePath)) {
    return homePath;
  }

  return path.join(getAppDir(), fileName);
}

function parseSessionUpdateMessages(chunk) {
  const messages = [];
  const lines = String(chunk || '').split('\n');
  const normalizeRole = (role) => {
    if (role === 'assistant' || role === 'user') {
      return role;
    }
    return null;
  };
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      // Claude JSONL 格式（保持原有逻辑不变）
      if (parsed.type === 'user' || parsed.type === 'assistant') {
        const content = normalizeSessionUpdateContent(parsed.message?.content, {
          normalizeOptions: SESSION_UPDATE_NORMALIZE_OPTIONS
        });

        const messageId = parsed.id
          || parsed.uuid
          || parsed.message?.id
          || `${parsed.type}-${parsed.timestamp || Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        messages.push({
          id: String(messageId),
          type: parsed.type,
          content,
          timestamp: parsed.timestamp || null,
          model: parsed.model || null
        });
        return;
      }

      // Codex JSONL: 仅以 response_item/message 作为权威消息源
      if (parsed.type === 'response_item' && parsed.payload) {
        const payload = parsed.payload;
        if (payload.type !== 'message') {
          return;
        }

        const role = normalizeRole(payload.role);
        if (!role) {
          return;
        }

        const content = normalizeSessionUpdateContent(payload.content, {
          trim: true,
          normalizeOptions: SESSION_UPDATE_NORMALIZE_OPTIONS
        });
        if (!content) {
          return;
        }

        const messageId = parsed.id
          || parsed.uuid
          || payload.id
          || `${role}-${parsed.timestamp || Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

        messages.push({
          id: String(messageId),
          type: role,
          role,
          content,
          timestamp: parsed.timestamp || null,
          model: parsed.model || null
        });
        return;
      }

      // Codex JSONL: event_msg 为事件通知，消息以 response_item 为准，统一跳过
      if (parsed.type === 'event_msg') {
        return;
      }

      // Codex JSONL: 顶层 user_message 与 response_item 重复，跳过
      if (parsed.type === 'user_message') {
        return;
      }
    } catch (err) {
      // 忽略半行或非 JSON 行
    }
  });

  return messages;
}

/**
 * 监听 Session 文件变化（引用计数）
 * @param {string} sessionId 会话 ID
 * @param {string|object} options 可选参数，支持 projectName/channel
 */
function watchSession(sessionId, options = {}) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return null;
  }

  const watcherInfo = sessionWatchers.get(normalizedSessionId);
  if (watcherInfo) {
    watcherInfo.count += 1;
    return watcherInfo.filePath;
  }

  const filePath = resolveSessionWatchFilePath(normalizedSessionId, options);
  const channel = resolveWatchChannel(options);
  console.log(`[watchSession] sessionId=${normalizedSessionId}, channel=${options.channel}, filePath=${filePath}, fileExists=${fs.existsSync(filePath)}`);
  const state = {
    count: 1,
    filePath,
    offset: 0,
    messageCount: 0,
    pendingChunk: '',
    listener: null
  };

  if (channel === 'gemini') {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const session = JSON.parse(content);
        state.messageCount = Array.isArray(session?.messages) ? session.messages.length : 0;
      }
    } catch (err) {
      state.messageCount = 0;
    }
  } else {
    try {
      if (fs.existsSync(filePath)) {
        state.offset = fs.readFileSync(filePath, 'utf8').length;
      }
    } catch (err) {
      state.offset = 0;
    }
  }

  state.listener = () => {
    console.log(`[watchSession.listener] FILE CHANGED: sessionId=${normalizedSessionId}, filePath=${filePath}`);
    try {
      if (channel === 'gemini') {
        const content = fs.readFileSync(filePath, 'utf8');
        const session = JSON.parse(content);
        const currentMessages = Array.isArray(session?.messages) ? session.messages : [];
        const prevCount = Number.isInteger(state.messageCount) ? state.messageCount : 0;

        if (currentMessages.length <= prevCount) {
          state.messageCount = currentMessages.length;
          return;
        }

        const newMessages = currentMessages.slice(prevCount);
        state.messageCount = currentMessages.length;

        const messages = newMessages.map((message, index) => {
          const role = message?.type === 'user' ? 'user' : 'assistant';
          const normalizedContent = normalizeSessionUpdateContent(message?.content, {
            preprocessGeminiParts: true,
            trim: true,
            normalizeOptions: GEMINI_SESSION_UPDATE_NORMALIZE_OPTIONS
          });
          if (!normalizedContent) {
            return null;
          }

          const messageId = message?.id || `${role}-${message?.timestamp || Date.now()}-${index}`;
          return {
            id: String(messageId),
            type: role,
            role,
            content: normalizedContent,
            timestamp: message?.timestamp || null
          };
        }).filter(Boolean);

        if (messages.length > 0) {
          broadcastSessionUpdate(normalizedSessionId, messages);
        }
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      if (content.length < state.offset) {
        state.offset = 0;
        state.pendingChunk = '';
      }

      const appended = content.slice(state.offset);
      state.offset = content.length;
      if (!appended) {
        return;
      }

      const merged = state.pendingChunk + appended;
      const lines = merged.split('\n');
      state.pendingChunk = lines.pop() || '';
      const messages = parseSessionUpdateMessages(lines.join('\n'));

      if (messages.length > 0) {
        broadcastSessionUpdate(normalizedSessionId, messages);
      }
    } catch (err) {
      // 文件可能暂时不可读，忽略本次变更
    }
  };

  fs.watchFile(filePath, { persistent: false }, state.listener);
  sessionWatchers.set(normalizedSessionId, state);
  return filePath;
}

/**
 * 停止监听 Session 文件变化（引用计数）
 * @param {string} sessionId 会话 ID
 * @param {string|object} options 可选参数，支持 projectName/channel
 */
function unwatchSession(sessionId, options = {}) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return;
  }

  const watcherInfo = sessionWatchers.get(normalizedSessionId);
  const filePath = watcherInfo?.filePath || resolveSessionWatchFilePath(normalizedSessionId, options);

  if (!watcherInfo) {
    fs.unwatchFile(filePath);
    return;
  }

  watcherInfo.count -= 1;
  if (watcherInfo.count > 0) {
    return;
  }

  fs.unwatchFile(filePath, watcherInfo.listener);
  sessionWatchers.delete(normalizedSessionId);
}

module.exports = {
  getProjects,
  getProjectsWithStats,
  getSessionsForProject,
  deleteSession,
  forkSession,
  getRecentSessions,
  getProjectOrder,
  saveProjectOrder,
  getSessionOrder,
  saveSessionOrder,
  deleteProject,
  parseRealProjectPath,
  searchSessions,
  searchSessionsAcrossProjects,
  SessionListCache,
  getSessionListCache,
  getSessionListCacheKey,
  getRecentSessionsOptimized,
  cleanupSessionRelations,
  getForkRelations,
  saveForkRelations,
  hasActualMessages,
  getProjectAndSessionCounts,
  getSubagentMessages,
  parseSessionUpdateMessages,
  watchSession,
  unwatchSession
};
