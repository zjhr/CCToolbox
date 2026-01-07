const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { getAppDir } = require('../../utils/app-path-manager');
const { parseSessionInfoFast } = require('../../utils/session');
const {
  getSessionOrder,
  saveSessionOrder,
  getForkRelations,
  saveForkRelations,
  cleanupSessionRelations
} = require('./sessions');
const { loadAliases, setAlias, deleteAlias, getAlias } = require('./alias');
const { parseSessionMeta, readJSONL, extractMessages } = require('./codex-parser');
const { getSessionsByProject: getCodexSessionsByProject } = require('./codex-sessions');
const { getProjectSessions: getGeminiSessionsByProject, cleanupGeminiForkRelations } = require('./gemini-sessions');
const { buildMessageCounts } = require('./message-counts');

const TRASH_VERSION = '1.0';
const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TRASH_CHANNELS = ['claude', 'codex', 'gemini'];

const LOCK_RETRY_DELAY_MS = 50;
const LOCK_MAX_RETRIES = 40;
const LOCK_STALE_MS = 10000;

function getTrashBaseDir() {
  return path.join(getAppDir(), 'trash');
}

function getTrashIndexPath() {
  return path.join(getAppDir(), 'trash-index.json');
}

function getTrashLockPath() {
  return path.join(getAppDir(), 'trash-index.lock');
}

function getTrashChannelDir(channel) {
  return path.join(getTrashBaseDir(), channel);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createEmptyIndex() {
  return {
    version: TRASH_VERSION,
    lastCleanup: 0,
    stats: {
      totalItems: 0,
      totalSize: 0,
      byChannel: {
        claude: 0,
        codex: 0,
        gemini: 0
      }
    },
    items: []
  };
}

function ensureTrashStorage() {
  ensureDir(getTrashBaseDir());
  TRASH_CHANNELS.forEach(channel => ensureDir(getTrashChannelDir(channel)));

  const indexPath = getTrashIndexPath();
  if (!fs.existsSync(indexPath)) {
    const index = createEmptyIndex();
    const tempPath = `${indexPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(index, null, 2), 'utf8');
    fs.renameSync(tempPath, indexPath);
  }
}

async function acquireIndexLock() {
  const lockPath = getTrashLockPath();
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try {
      const handle = await fs.promises.open(lockPath, 'wx');
      return handle;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }

      try {
        const stats = await fs.promises.stat(lockPath);
        if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
          await fs.promises.unlink(lockPath);
          continue;
        }
      } catch (statErr) {
        // 忽略锁文件读取失败
      }

      await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    }
  }

  throw new Error('Trash index is locked');
}

async function releaseIndexLock(handle) {
  const lockPath = getTrashLockPath();
  try {
    await handle.close();
  } finally {
    try {
      await fs.promises.unlink(lockPath);
    } catch (err) {
      // 忽略锁文件清理失败
    }
  }
}

function normalizeIndex(index) {
  if (!index || typeof index !== 'object') {
    return createEmptyIndex();
  }

  const normalized = {
    ...createEmptyIndex(),
    ...index
  };

  if (!Array.isArray(normalized.items)) {
    normalized.items = [];
  }

  if (!normalized.stats || typeof normalized.stats !== 'object') {
    normalized.stats = createEmptyIndex().stats;
  }

  TRASH_CHANNELS.forEach(channel => {
    if (typeof normalized.stats.byChannel[channel] !== 'number') {
      normalized.stats.byChannel[channel] = 0;
    }
  });

  return normalized;
}

function rebuildTrashStats(index) {
  const stats = {
    totalItems: index.items.length,
    totalSize: 0,
    byChannel: {
      claude: 0,
      codex: 0,
      gemini: 0
    }
  };

  index.items.forEach(item => {
    if (stats.byChannel[item.channel] !== undefined) {
      stats.byChannel[item.channel] += 1;
    }
    stats.totalSize += item?.backup?.fileSize || 0;
  });

  index.stats = stats;
  return index;
}

async function loadTrashIndex() {
  ensureTrashStorage();
  const indexPath = getTrashIndexPath();
  try {
    const raw = await fs.promises.readFile(indexPath, 'utf8');
    return normalizeIndex(JSON.parse(raw));
  } catch (err) {
    return createEmptyIndex();
  }
}

async function writeTrashIndex(index) {
  const indexPath = getTrashIndexPath();
  const tempPath = `${indexPath}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(index, null, 2), 'utf8');
  await fs.promises.rename(tempPath, indexPath);
}

async function updateTrashIndex(updateFn) {
  ensureTrashStorage();
  const lockHandle = await acquireIndexLock();
  try {
    const index = await loadTrashIndex();
    const updated = await updateFn(index) || index;
    rebuildTrashStats(updated);
    await writeTrashIndex(updated);
    return updated;
  } finally {
    await releaseIndexLock(lockHandle);
  }
}

function getSafeProjectName(projectName) {
  return String(projectName || '').replace(/[\/\\:]/g, '-');
}

function generateTrashId(sessionId) {
  if (crypto.randomUUID) {
    return `trash-${crypto.randomUUID()}`;
  }
  return `trash-${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${sessionId}`;
}

function moveFileSync(sourcePath, targetPath) {
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
      return;
    }
    throw err;
  }
}

function getClaudeSessionFile(config, projectName, sessionId) {
  const projectDir = path.join(config.projectsDir, projectName);
  return path.join(projectDir, `${sessionId}.jsonl`);
}

function getCodexSessionFile(projectName, sessionId) {
  const sessions = getCodexSessionsByProject(projectName);
  return sessions.find(session => session.sessionId === sessionId);
}

function getGeminiSessionFile(projectHash, sessionId) {
  const sessions = getGeminiSessionsByProject(projectHash);
  return sessions.find(session => session.sessionId === sessionId);
}

function buildTrashFilePath(channel, projectName, sessionId, extension) {
  const safeProject = getSafeProjectName(projectName);
  const filename = `${channel}_${safeProject}_${sessionId}${extension}`;
  return path.join(getTrashChannelDir(channel), filename);
}

function resolveTrashFilePath(channel, projectName, sessionId, extension) {
  const safeProject = getSafeProjectName(projectName);
  let candidate = buildTrashFilePath(channel, projectName, sessionId, extension);
  if (!fs.existsSync(candidate)) {
    return candidate;
  }

  let counter = 0;
  while (fs.existsSync(candidate)) {
    counter += 1;
    const filename = `${channel}_${safeProject}_${sessionId}_${counter}${extension}`;
    candidate = path.join(getTrashChannelDir(channel), filename);
  }
  return candidate;
}

function getForkSnapshot(sessionId) {
  const forkRelations = getForkRelations();
  const forkedFrom = forkRelations[sessionId] || null;
  const forkedBy = Object.keys(forkRelations).filter(key => forkRelations[key] === sessionId);
  return { forkedFrom, forkedBy };
}

function getSessionOrderIndex(projectKey, sessionId) {
  const order = getSessionOrder(projectKey);
  const index = order.indexOf(sessionId);
  return index >= 0 ? index : null;
}

function restoreSessionOrder(projectKey, sessionId, orderIndex) {
  if (!projectKey) return;
  const order = getSessionOrder(projectKey);
  if (order.includes(sessionId)) {
    return;
  }

  if (typeof orderIndex === 'number' && orderIndex >= 0) {
    const nextOrder = [...order];
    nextOrder.splice(Math.min(orderIndex, nextOrder.length), 0, sessionId);
    saveSessionOrder(projectKey, nextOrder);
    return;
  }

  saveSessionOrder(projectKey, [...order, sessionId]);
}

function buildCodexRestorePath(originalPath, sessionId) {
  const dir = path.dirname(originalPath);
  const match = path.basename(originalPath).match(/^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-[\w-]+\.jsonl$/);
  const timestamp = match ? match[1] : new Date().toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-');
  return path.join(dir, `rollout-${timestamp}-${sessionId}.jsonl`);
}

function buildGeminiRestorePath(dir) {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-');
  const shortId = crypto.randomBytes(4).toString('hex');
  return path.join(dir, `session-${timestamp}-${shortId}.json`);
}

function resolveRestoreSessionId(sessionId, projectDir, extension) {
  const targetPath = path.join(projectDir, `${sessionId}${extension}`);
  if (!fs.existsSync(targetPath)) {
    return { sessionId, targetPath };
  }

  let counter = 0;
  let candidateId = `${sessionId}_restored`;
  let candidatePath = path.join(projectDir, `${candidateId}${extension}`);
  while (fs.existsSync(candidatePath)) {
    counter += 1;
    candidateId = `${sessionId}_restored_${counter}`;
    candidatePath = path.join(projectDir, `${candidateId}${extension}`);
  }

  return { sessionId: candidateId, targetPath: candidatePath };
}

function resolveCodexRestorePath(originalPath, sessionId) {
  const targetPath = buildCodexRestorePath(originalPath, sessionId);
  if (!fs.existsSync(targetPath)) {
    return { sessionId, targetPath };
  }

  let counter = 0;
  let candidateId = `${sessionId}_restored`;
  let candidatePath = buildCodexRestorePath(originalPath, candidateId);
  while (fs.existsSync(candidatePath)) {
    counter += 1;
    candidateId = `${sessionId}_restored_${counter}`;
    candidatePath = buildCodexRestorePath(originalPath, candidateId);
  }

  return { sessionId: candidateId, targetPath: candidatePath };
}

function getGeminiFirstMessage(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const session = JSON.parse(content);
    const messages = session.messages || [];
    const firstUserMessage = messages.find(msg => msg.type === 'user');
    return firstUserMessage?.content || '';
  } catch (err) {
    return '';
  }
}

async function moveToTrash(config, projectName, sessionId, channel) {
  ensureTrashStorage();
  const now = Date.now();
  const expiresAt = now + TRASH_RETENTION_MS;
  const alias = getAlias(sessionId);
  let forkedFrom = null;
  let forkedBy = [];

  let sessionFilePath = '';
  let backup = {
    alias: alias || null,
    forkedFrom,
    forkedBy,
    sessionOrderIndex: null,
    fileSize: 0,
    lastModified: null,
    firstMessage: ''
  };
  let projectKey = projectName;

  if (channel === 'claude') {
    ({ forkedFrom, forkedBy } = getForkSnapshot(sessionId));
    sessionFilePath = getClaudeSessionFile(config, projectName, sessionId);
    if (!fs.existsSync(sessionFilePath)) {
      throw new Error('Session not found');
    }
    const info = parseSessionInfoFast(sessionFilePath);
    const stats = fs.statSync(sessionFilePath);
    backup = {
      ...backup,
      forkedFrom,
      forkedBy,
      sessionOrderIndex: getSessionOrderIndex(projectName, sessionId),
      fileSize: stats.size,
      lastModified: stats.mtimeMs,
      firstMessage: info.firstMessage || ''
    };
  } else if (channel === 'codex') {
    ({ forkedFrom, forkedBy } = getForkSnapshot(sessionId));
    const session = getCodexSessionFile(projectName, sessionId);
    if (!session || !session.filePath) {
      throw new Error('Session not found');
    }
    sessionFilePath = session.filePath;
    const meta = parseSessionMeta(sessionFilePath);
    const stats = fs.statSync(sessionFilePath);
    projectKey = `codex-${projectName}`;
    backup = {
      ...backup,
      forkedFrom,
      forkedBy,
      sessionOrderIndex: getSessionOrderIndex(projectKey, sessionId),
      fileSize: stats.size,
      lastModified: stats.mtimeMs,
      firstMessage: meta?.preview || ''
    };
  } else if (channel === 'gemini') {
    const session = getGeminiSessionFile(projectName, sessionId);
    if (!session || !session.filePath) {
      throw new Error('Session not found');
    }
    forkedFrom = session.forkedFrom || null;
    const allGeminiSessions = getGeminiSessionsByProject(projectName);
    forkedBy = allGeminiSessions
      .filter(item => item.forkedFrom === sessionId)
      .map(item => item.sessionId);
    sessionFilePath = session.filePath;
    const stats = fs.statSync(sessionFilePath);
    backup = {
      ...backup,
      forkedFrom,
      forkedBy,
      sessionOrderIndex: null,
      fileSize: stats.size,
      lastModified: stats.mtimeMs,
      firstMessage: getGeminiFirstMessage(sessionFilePath)
    };
  } else {
    throw new Error('Invalid channel');
  }

  const extension = path.extname(sessionFilePath) || '.jsonl';
  const trashFilePath = resolveTrashFilePath(channel, projectName, sessionId, extension);
  const trashId = generateTrashId(sessionId);

  moveFileSync(sessionFilePath, trashFilePath);

  if (channel === 'gemini') {
    cleanupGeminiForkRelations(sessionId);
  }

  cleanupSessionRelations(sessionId);

  await updateTrashIndex(index => {
    index.items.push({
      trashId,
      sessionId,
      projectName,
      channel,
      deletedAt: now,
      expiresAt,
      originalPath: sessionFilePath,
      trashFilePath,
      backup,
      projectKey
    });
    return index;
  });

  return { success: true, trashId };
}

async function listTrash(projectName, channel) {
  const index = await loadTrashIndex();
  const now = Date.now();
  const items = index.items
    .filter(item => item.channel === channel && item.projectName === projectName)
    .map(item => ({
      trashId: item.trashId,
      sessionId: item.sessionId,
      alias: item.backup?.alias || null,
      deletedAt: item.deletedAt,
      expiresAt: item.expiresAt,
      remainingTime: Math.max(0, item.expiresAt - now),
      fileSize: item.backup?.fileSize || 0,
      firstMessage: item.backup?.firstMessage || '',
      forkedFrom: item.backup?.forkedFrom || null
    }))
    .sort((a, b) => b.deletedAt - a.deletedAt);

  const stats = {
    total: items.length,
    totalSize: items.reduce((sum, item) => sum + (item.fileSize || 0), 0)
  };

  return { items, stats };
}

async function parseClaudeMessages(filePath) {
  const allMessages = [];
  const metadata = {};

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
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

        if (json.type === 'user' || json.type === 'assistant') {
          const message = {
            type: json.type,
            content: null,
            timestamp: json.timestamp || null,
            model: json.model || null
          };

          if (json.type === 'user') {
            if (typeof json.message?.content === 'string') {
              message.content = json.message.content;
            } else if (Array.isArray(json.message?.content)) {
              const parts = [];
              for (const item of json.message.content) {
                if (item.type === 'text' && item.text) {
                  parts.push(item.text);
                } else if (item.type === 'tool_result') {
                  const resultContent = typeof item.content === 'string'
                    ? item.content
                    : JSON.stringify(item.content, null, 2);
                  parts.push(`**[工具结果]**\n\`\`\`\n${resultContent}\n\`\`\``);
                } else if (item.type === 'image') {
                  parts.push('[图片]');
                }
              }
              message.content = parts.join('\n\n') || '[工具交互]';
            }
          } else if (json.type === 'assistant') {
            if (Array.isArray(json.message?.content)) {
              const parts = [];
              for (const item of json.message.content) {
                if (item.type === 'text' && item.text) {
                  parts.push(item.text);
                } else if (item.type === 'tool_use') {
                  const inputStr = JSON.stringify(item.input, null, 2);
                  parts.push(`**[调用工具: ${item.name}]**\n\`\`\`json\n${inputStr}\n\`\`\``);
                } else if (item.type === 'thinking' && item.thinking) {
                  parts.push(`**[思考]**\n${item.thinking}`);
                }
              }
              message.content = parts.join('\n\n') || '[处理中...]';
            } else if (typeof json.message?.content === 'string') {
              message.content = json.message.content;
            }
          }

          if (message.content && message.content !== 'Warmup') {
            allMessages.push(message);
          }
        }
      } catch (err) {
        // 忽略无效行
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return { messages: allMessages, metadata };
}

function parseCodexMessages(filePath) {
  const lines = readJSONL(filePath);
  const extracted = extractMessages(lines);
  const messages = extracted
    .filter(item => item.role === 'user' || item.role === 'assistant')
    .map(item => ({
      type: item.role,
      content: item.content || '',
      timestamp: item.timestamp || null,
      model: item.model || null
    }));

  return { messages, metadata: {} };
}

function parseGeminiMessages(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const session = JSON.parse(content);
    const messages = (session.messages || []).map(item => {
      const type = item.type === 'user' ? 'user' : 'assistant';
      let contentText = '';
      if (typeof item.content === 'string') {
        contentText = item.content;
      } else if (Array.isArray(item.content)) {
        contentText = item.content.map(part => part.text || part.content || '').join('\n');
      } else if (Array.isArray(item.parts)) {
        contentText = item.parts.map(part => part.text || part.content || '').join('\n');
      } else if (item.text) {
        contentText = item.text;
      }
      return {
        type,
        content: contentText,
        timestamp: item.timestamp || item.time || null,
        model: item.model || null
      };
    }).filter(item => item.content);

    return { messages, metadata: {} };
  } catch (err) {
    return { messages: [], metadata: {} };
  }
}

async function getTrashMessages(projectName, trashId, channel, options = {}) {
  const pageNum = parseInt(options.page || 1);
  const limitNum = parseInt(options.limit || 20);
  const order = options.order || 'desc';

  const index = await loadTrashIndex();
  const item = index.items.find(entry =>
    entry.trashId === trashId && entry.projectName === projectName && entry.channel === channel
  );

  if (!item || !item.trashFilePath || !fs.existsSync(item.trashFilePath)) {
    throw new Error('Trash item not found');
  }

  let parsed = { messages: [], metadata: {} };
  if (channel === 'claude') {
    parsed = await parseClaudeMessages(item.trashFilePath);
  } else if (channel === 'codex') {
    parsed = parseCodexMessages(item.trashFilePath);
  } else if (channel === 'gemini') {
    parsed = parseGeminiMessages(item.trashFilePath);
  }

  const allMessages = parsed.messages || [];
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
    metadata: parsed.metadata || {},
    messageCounts,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      hasMore
    }
  };
}

function resolveAliasConflict(aliases, alias, sessionId) {
  if (!alias) return null;
  const conflictEntry = Object.entries(aliases)
    .find(([key, value]) => value === alias && key !== sessionId);
  if (!conflictEntry) return null;
  return conflictEntry[0];
}

async function restoreFromTrash(config, projectName, trashIds, channel, options = {}) {
  const aliasStrategy = options.aliasStrategy || null;
  const allowedStrategies = ['keep-existing', 'overwrite', 'cancel'];
  if (aliasStrategy && !allowedStrategies.includes(aliasStrategy)) {
    throw new Error('Invalid alias strategy');
  }

  const aliases = loadAliases();
  const forkRelations = getForkRelations();
  let forkRelationsModified = false;
  const existingCodexSessionIds = channel === 'codex'
    ? new Set(getCodexSessionsByProject(projectName).map(session => session.sessionId))
    : null;

  const restored = [];
  const failed = [];
  const conflicts = [];

  const index = await loadTrashIndex();
  const items = index.items.filter(item => trashIds.includes(item.trashId));
  const missingIds = trashIds.filter(trashId => !items.find(item => item.trashId === trashId));
  missingIds.forEach(trashId => {
    failed.push({ trashId, reason: 'Trash item not found' });
  });

  for (const item of items) {
    if (item.channel !== channel || item.projectName !== projectName) {
      failed.push({ trashId: item.trashId, reason: 'Channel or project mismatch' });
      continue;
    }

    const backup = item.backup || {};
    const alias = backup.alias || null;
    const conflictSessionId = resolveAliasConflict(aliases, alias, item.sessionId);

    if (conflictSessionId && !aliasStrategy) {
      conflicts.push({
        trashId: item.trashId,
        alias,
        conflictSessionId
      });
      continue;
    }

    if (conflictSessionId && aliasStrategy === 'cancel') {
      failed.push({ trashId: item.trashId, reason: 'Alias conflict' });
      continue;
    }

    let finalAlias = alias;
    if (conflictSessionId && aliasStrategy === 'keep-existing') {
      finalAlias = null;
    }

    if (conflictSessionId && aliasStrategy === 'overwrite') {
      try {
        deleteAlias(conflictSessionId);
        delete aliases[conflictSessionId];
      } catch (err) {
        failed.push({ trashId: item.trashId, reason: 'Failed to overwrite alias' });
        continue;
      }
    }

    let targetPath = item.originalPath;
    let restoredSessionId = item.sessionId;
    const originalExtension = path.extname(item.originalPath) || '.jsonl';

    if (channel === 'claude') {
      const projectDir = path.dirname(item.originalPath);
      ensureDir(projectDir);
      const { sessionId: resolvedId, targetPath: resolvedPath } =
        resolveRestoreSessionId(item.sessionId, projectDir, originalExtension);
      restoredSessionId = resolvedId;
      targetPath = resolvedPath;
    }

    if (channel === 'codex') {
      ensureDir(path.dirname(item.originalPath));
      const resolved = resolveCodexRestorePath(item.originalPath, item.sessionId);
      restoredSessionId = resolved.sessionId;
      targetPath = resolved.targetPath;
    }

    if (channel === 'gemini') {
      const targetDir = path.dirname(item.originalPath);
      ensureDir(targetDir);
      if (fs.existsSync(item.originalPath)) {
        let counter = 0;
        let candidateId = `${item.sessionId}_restored`;
        let candidatePath = buildGeminiRestorePath(targetDir);
        while (fs.existsSync(candidatePath)) {
          counter += 1;
          candidateId = `${item.sessionId}_restored_${counter}`;
          candidatePath = buildGeminiRestorePath(targetDir);
        }
        restoredSessionId = candidateId;
        targetPath = candidatePath;
      }
    }

    try {
      moveFileSync(item.trashFilePath, targetPath);
    } catch (err) {
      failed.push({ trashId: item.trashId, reason: err.message });
      continue;
    }

    if (channel === 'gemini') {
      try {
        const content = fs.readFileSync(targetPath, 'utf8');
        const sessionData = JSON.parse(content);
        sessionData.sessionId = restoredSessionId;
        sessionData.forkedFrom = backup.forkedFrom || null;
        sessionData.lastUpdated = new Date().toISOString();
        fs.writeFileSync(targetPath, JSON.stringify(sessionData, null, 2), 'utf8');

        const allGeminiSessions = getGeminiSessionsByProject(projectName);
        const childSessions = (backup.forkedBy || []).filter(childId =>
          allGeminiSessions.some(session => session.sessionId === childId)
        );
        childSessions.forEach(childId => {
          const childSession = allGeminiSessions.find(session => session.sessionId === childId);
          if (!childSession) return;
          const childData = fs.readFileSync(childSession.filePath, 'utf8');
          const childJson = JSON.parse(childData);
          childJson.forkedFrom = restoredSessionId;
          childJson.lastUpdated = new Date().toISOString();
          fs.writeFileSync(childSession.filePath, JSON.stringify(childJson, null, 2), 'utf8');
        });
      } catch (err) {
        try {
          moveFileSync(targetPath, item.trashFilePath);
        } catch (moveErr) {
          // 忽略回滚失败
        }
        failed.push({ trashId: item.trashId, reason: err.message });
        continue;
      }
    }

    if (finalAlias) {
      try {
        setAlias(restoredSessionId, finalAlias);
        aliases[restoredSessionId] = finalAlias;
      } catch (err) {
        // 忽略别名恢复失败
      }
    }

    if (channel !== 'gemini') {
      if (backup.forkedFrom) {
        forkRelations[restoredSessionId] = backup.forkedFrom;
        forkRelationsModified = true;
      }

      (backup.forkedBy || []).forEach(childId => {
        if (channel === 'codex' && existingCodexSessionIds && !existingCodexSessionIds.has(childId)) {
          return;
        }
        if (channel === 'claude') {
          const childPath = path.join(config.projectsDir, projectName, `${childId}.jsonl`);
          if (!fs.existsSync(childPath)) {
            return;
          }
        }
        forkRelations[childId] = restoredSessionId;
        forkRelationsModified = true;
      });
    }

    if (backup.sessionOrderIndex !== null) {
      const projectKey = item.projectKey || item.projectName;
      restoreSessionOrder(projectKey, restoredSessionId, backup.sessionOrderIndex);
    }

    restored.push({
      trashId: item.trashId,
      sessionId: restoredSessionId
    });
  }

  if (forkRelationsModified) {
    saveForkRelations(forkRelations);
  }

  if (restored.length > 0) {
    await updateTrashIndex(current => {
      current.items = current.items.filter(item => !restored.find(restoredItem => restoredItem.trashId === item.trashId));
      return current;
    });
  }

  if (conflicts.length > 0 && restored.length === 0) {
    return { success: false, conflicts, restored: 0, failed: failed.length };
  }

  return {
    success: conflicts.length === 0 && failed.length === 0,
    restored: restored.length,
    failed: failed.length,
    conflicts
  };
}

async function permanentDelete(projectName, trashId) {
  let deleted = false;
  await updateTrashIndex(index => {
    const target = index.items.find(item => item.trashId === trashId && item.projectName === projectName);
    if (!target) {
      return index;
    }

    try {
      if (fs.existsSync(target.trashFilePath)) {
        fs.unlinkSync(target.trashFilePath);
      }
      deleted = true;
    } catch (err) {
      // 忽略删除失败
    }

    index.items = index.items.filter(item => item.trashId !== trashId);
    return index;
  });
  return { success: deleted };
}

async function emptyTrash(projectName, channel) {
  let deletedCount = 0;
  await updateTrashIndex(index => {
    const remaining = [];
    index.items.forEach(item => {
      if (item.channel === channel && item.projectName === projectName) {
        try {
          if (fs.existsSync(item.trashFilePath)) {
            fs.unlinkSync(item.trashFilePath);
          }
          deletedCount += 1;
        } catch (err) {
          // 忽略删除失败
        }
      } else {
        remaining.push(item);
      }
    });
    index.items = remaining;
    return index;
  });

  return { success: true, deletedCount };
}

async function cleanupExpiredTrash() {
  await updateTrashIndex(index => {
    const now = Date.now();
    const remaining = [];

    index.items.forEach(item => {
      const isExpired = item.expiresAt && item.expiresAt <= now;
      const fileMissing = !item.trashFilePath || !fs.existsSync(item.trashFilePath);

      if (isExpired || fileMissing) {
        if (!fileMissing) {
          try {
            fs.unlinkSync(item.trashFilePath);
          } catch (err) {
            // 忽略删除失败
          }
        }
      } else {
        remaining.push(item);
      }
    });

    index.items = remaining;
    index.lastCleanup = now;
    return index;
  });
}

function startTrashCleanup() {
  cleanupExpiredTrash().catch(() => {});
  return setInterval(() => {
    cleanupExpiredTrash().catch(() => {});
  }, 60 * 60 * 1000);
}

module.exports = {
  ensureTrashStorage,
  moveToTrash,
  listTrash,
  restoreFromTrash,
  permanentDelete,
  emptyTrash,
  cleanupExpiredTrash,
  startTrashCleanup,
  getTrashMessages
};
