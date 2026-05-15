const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { getCodexDir } = require('./codex-config');

// ============================================
// 缓存状态
// ============================================

let projectsCache = null;
let sessionsByProjectCache = new Map();
let lastProjectsRefreshTime = 0;
let lastSessionsRefreshTime = new Map();  // 每个项目独立的刷新时间
let cacheTTL = 30 * 1000;  // 默认 30 秒
let refreshPromise = null;  // 防止惊群效应
let fileWatcher = null;  // 文件监听器

// ============================================
// 公共接口
// ============================================

/**
 * 获取缓存的项目列表
 * @returns {Array} 项目数组
 */
function getCachedProjects() {
  const now = Date.now();

  // 缓存有效，直接返回
  if (projectsCache && now - lastProjectsRefreshTime < cacheTTL) {
    return projectsCache;
  }

  // 已有刷新任务在进行，等待其完成
  if (refreshPromise) {
    // 同步返回旧缓存（如果有的话）
    if (projectsCache) {
      return projectsCache;
    }
    // 没有旧缓存，需要等待刷新完成（这里简化处理，直接刷新）
  }

  // 发起刷新任务
  refreshProjectsCache();

  return projectsCache;
}

/**
 * 获取缓存的会话列表
 * @param {string} projectName - 项目名称
 * @returns {Array} 会话数组
 */
function getCachedSessions(projectName) {
  const now = Date.now();
  const lastRefresh = lastSessionsRefreshTime.get(projectName) || 0;

  // 缓存有效，直接返回
  if (sessionsByProjectCache.has(projectName) && now - lastRefresh < cacheTTL) {
    return sessionsByProjectCache.get(projectName);
  }

  // 刷新该项目的会话缓存
  refreshSessionsCache(projectName);

  return sessionsByProjectCache.get(projectName) || [];
}

/**
 * 清除所有缓存
 */
function clearAllCache() {
  projectsCache = null;
  sessionsByProjectCache.clear();
  lastProjectsRefreshTime = 0;
  lastSessionsRefreshTime.clear();
  refreshPromise = null;
}

/**
 * 设置缓存 TTL（测试用）
 * @param {number} ttl - TTL 毫秒数
 */
function setCacheTTL(ttl) {
  cacheTTL = ttl;
}

/**
 * 会话删除时更新缓存
 * @param {string} sessionId - 被删除的会话 ID
 */
function onSessionDeleted(sessionId) {
  // 从所有项目的会话列表中移除
  for (const [projectName, sessions] of sessionsByProjectCache) {
    const index = sessions.findIndex(s => s.sessionId === sessionId);
    if (index >= 0) {
      sessions.splice(index, 1);

      // 更新项目统计
      if (projectsCache) {
        const project = projectsCache.find(p => p.name === projectName);
        if (project) {
          project.sessionCount = Math.max(0, project.sessionCount - 1);
        }
      }
      break;  // 找到并移除后退出
    }
  }
}

/**
 * 会话创建时更新缓存
 * @param {Object} session - 新会话对象
 */
function onSessionCreated(session) {
  const cwd = session.meta?.cwd || '';
  const projectName = path.basename(cwd) || 'unknown';

  // 获取文件大小
  let size = 0;
  let mtime = session.meta?.timestamp || new Date().toISOString();
  try {
    if (session.filePath && fs.existsSync(session.filePath)) {
      const stats = fs.statSync(session.filePath);
      size = stats.size;
      mtime = stats.mtime.toISOString();
    }
  } catch (err) {
    // 忽略错误
  }

  // 添加到会话缓存
  if (!sessionsByProjectCache.has(projectName)) {
    sessionsByProjectCache.set(projectName, []);
  }

  const sessions = sessionsByProjectCache.get(projectName);
  const newSessionEntry = {
    sessionId: session.sessionId,
    filePath: session.filePath,
    mtime,
    size,
    gitBranch: session.meta?.git?.branch || null,
    firstMessage: session.preview || null,
    projectName,
    source: 'codex'
  };

  sessions.unshift(newSessionEntry);  // 新会话放在最前面

  // 更新项目统计
  if (projectsCache) {
    const project = projectsCache.find(p => p.name === projectName);
    if (project) {
      project.sessionCount++;
      project.lastUsed = Date.now();
    } else {
      // 新项目，需要刷新项目列表
      projectsCache = null;
    }
  }
}

// ============================================
// 文件监听
// ============================================

/**
 * 启动文件监听
 */
function setupCodexFileWatcher() {
  if (fileWatcher) {
    return;  // 已经启动
  }

  const sessionsDir = getSessionsDir();

  fileWatcher = chokidar.watch(sessionsDir, {
    ignored: /(^|[\/\\])\../,  // 忽略隐藏文件
    persistent: true,
    ignoreInitial: true,  // 忽略初始扫描
    awaitWriteFinish: {
      stabilityThreshold: 500,  // 500ms 稳定后才触发
      pollInterval: 100
    }
  });

  fileWatcher
    .on('add', (filePath) => {
      // 新会话文件
      const filename = path.basename(filePath);
      const match = filename.match(/rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([\w-]+)\.jsonl/);
      if (!match) return;

      const session = parseSessionMeta(filePath);
      if (session) {
        onSessionCreated({
          sessionId: match[2],
          filePath,
          meta: session.meta
        });
      }
    })
    .on('unlink', (filePath) => {
      // 删除会话文件
      const filename = path.basename(filePath);
      const match = filename.match(/rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([\w-]+)\.jsonl/);
      if (!match) return;

      onSessionDeleted(match[1]);
    });
}

/**
 * 停止文件监听
 */
function stopCodexFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
}

// ============================================
// 内部实现
// ============================================

/**
 * 刷新项目缓存
 */
function refreshProjectsCache() {
  // 直接扫描文件，不依赖 codex-sessions.js
  const sessionsDir = getSessionsDir();
  const projects = scanProjects(sessionsDir);
  projectsCache = projects;
  lastProjectsRefreshTime = Date.now();
}

/**
 * 刷新会话缓存
 * @param {string} projectName - 项目名称
 */
function refreshSessionsCache(projectName) {
  const sessionsDir = getSessionsDir();
  const files = scanDirectoryRecursive(sessionsDir);

  const sessions = [];
  files.forEach(file => {
    const session = parseSessionMeta(file.filePath);
    if (!session || !session.meta) return;

    const cwd = session.meta.cwd || '';
    const sessionProjectName = path.basename(cwd) || 'unknown';

    if (sessionProjectName === projectName) {
      // 获取文件大小
      let size = 0;
      let mtime = session.meta.timestamp;
      try {
        if (fs.existsSync(file.filePath)) {
          const stats = fs.statSync(file.filePath);
          size = stats.size;
          mtime = stats.mtime.toISOString();
        }
      } catch (err) {
        // 忽略错误
      }

      sessions.push({
        sessionId: file.sessionId,
        filePath: file.filePath,
        mtime,
        size,
        gitBranch: session.meta.git?.branch || null,
        firstMessage: session.preview || null,
        projectName: sessionProjectName,
        source: 'codex'
      });
    }
  });

  // 按时间倒序排序
  sessions.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

  sessionsByProjectCache.set(projectName, sessions);
  lastSessionsRefreshTime.set(projectName, Date.now());
}

/**
 * 扫描项目
 * @param {string} sessionsDir - 会话目录
 * @returns {Array} 项目数组
 */
function scanProjects(sessionsDir) {
  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  const files = scanDirectoryRecursive(sessionsDir);
  const projectMap = new Map();

  files.forEach(file => {
    const session = parseSessionMeta(file.filePath);
    if (!session || !session.meta) return;

    const cwd = session.meta.cwd || '';
    const projectName = path.basename(cwd) || 'unknown';

    if (!projectMap.has(projectName)) {
      projectMap.set(projectName, {
        name: projectName,
        displayName: projectName,
        fullPath: cwd,
        path: cwd,
        sessions: [],
        sessionCount: 0,
        lastUsed: null,
        source: 'codex'
      });
    }

    const project = projectMap.get(projectName);
    project.sessionCount++;

    const sessionTime = new Date(session.meta.timestamp).getTime();
    if (!project.lastUsed || sessionTime > project.lastUsed) {
      project.lastUsed = sessionTime;
    }
  });

  return Array.from(projectMap.values()).sort((a, b) => b.lastUsed - a.lastUsed);
}

/**
 * 递归扫描目录查找所有会话文件
 * @param {string} dir - 目录路径
 * @returns {Array} 会话文件信息数组
 */
function scanDirectoryRecursive(dir) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...scanDirectoryRecursive(fullPath));
    } else if (entry.isFile() && entry.name.match(/^rollout-.*\.jsonl$/)) {
      const match = entry.name.match(/rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-([\w-]+)\.jsonl/);
      if (match) {
        results.push({
          filePath: fullPath,
          timestamp: match[1],
          sessionId: match[2],
          date: match[1].split('T')[0]
        });
      }
    }
  }

  return results;
}

/**
 * 轻量级解析会话元数据
 * @param {string} filePath - JSONL 文件路径
 * @returns {Object|null} 会话元数据
 */
function parseSessionMeta(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return null;
    }

    let meta = null;
    let firstUserMessage = null;

    // 只读取前 50 行获取元数据和第一条消息
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      try {
        const json = JSON.parse(lines[i]);

        // 提取 session_meta
        if (!meta && json.type === 'session_meta' && json.payload) {
          const payload = json.payload;
          meta = {
            sessionId: payload.id,
            timestamp: payload.timestamp,
            cwd: payload.cwd,
            cliVersion: payload.cli_version,
            provider: payload.model_provider,
            git: payload.git ? {
              branch: payload.git.branch,
              commitHash: payload.git.commit_hash,
              repositoryUrl: payload.git.repository_url
            } : null
          };
        }

        // 获取第一条用户消息作为预览
        if (!firstUserMessage && json.type === 'response_item' && json.payload?.type === 'message' && json.payload?.role === 'user') {
          const contentParts = json.payload.content || [];
          const text = contentParts
            .map(c => c.text || c.input_text || '')
            .join('\n')
            .trim();
          // 跳过环境上下文、Warmup 等非真实用户消息
          if (text &&
              text !== 'Warmup' &&
              !text.startsWith('<environment_context>')) {
            firstUserMessage = text.substring(0, 100);
          }
        }
      } catch (err) {
        // 跳过无效行
      }
    }

    if (!meta) {
      return null;
    }

    return {
      filePath,
      meta,
      preview: firstUserMessage || ''
    };
  } catch (err) {
    return null;
  }
}

/**
 * 获取会话目录路径
 * @returns {string} 会话目录路径
 */
function getSessionsDir() {
  // 支持环境变量覆盖（测试用）
  if (process.env.CODEX_SESSIONS_DIR) {
    return process.env.CODEX_SESSIONS_DIR;
  }
  return path.join(getCodexDir(), 'sessions');
}

// ============================================
// 导出
// ============================================

module.exports = {
  getCachedProjects,
  getCachedSessions,
  clearAllCache,
  setCacheTTL,
  onSessionDeleted,
  onSessionCreated,
  setupCodexFileWatcher,
  stopCodexFileWatcher
};