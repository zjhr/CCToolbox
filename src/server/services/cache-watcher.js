const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { getSessionsDir: getCodexSessionsDir } = require('./codex-sessions');
const { getGeminiDir } = require('./gemini-config');

const WATCH_DEBOUNCE_MS = 500;

let watcherInstance = null;
let watcherStarted = false;
let watchedRoots = [];
const debounceTimers = new Map();

function normalizeWatchPath(targetPath) {
  try {
    return path.resolve(targetPath);
  } catch (err) {
    return targetPath;
  }
}

function canWatchPath(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch (err) {
    return false;
  }
}

function buildWatchTargets(config) {
  const candidates = [
    { channel: 'claude', path: config?.projectsDir },
    { channel: 'codex', path: getCodexSessionsDir() },
    { channel: 'gemini', path: path.join(getGeminiDir(), 'tmp') }
  ];

  return candidates
    .filter(item => item.path && canWatchPath(item.path))
    .map(item => ({
      channel: item.channel,
      path: normalizeWatchPath(item.path)
    }));
}

function resolveChannelByFilePath(filePath) {
  if (!filePath) return null;
  const normalizedPath = normalizeWatchPath(filePath);
  const matched = watchedRoots.find(root => normalizedPath.startsWith(root.path));
  return matched?.channel || null;
}

function clearDebounceTimers() {
  debounceTimers.forEach((timer) => clearTimeout(timer));
  debounceTimers.clear();
}

function scheduleInvalidate(cache, channel) {
  if (!cache || !channel) return;

  const previous = debounceTimers.get(channel);
  if (previous) {
    clearTimeout(previous);
  }

  const timer = setTimeout(() => {
    try {
      cache.invalidate(`${channel}:*`);
    } catch (err) {
      console.warn(`[CacheWatcher] Failed to invalidate cache for channel "${channel}":`, err.message);
    } finally {
      debounceTimers.delete(channel);
    }
  }, WATCH_DEBOUNCE_MS);

  debounceTimers.set(channel, timer);
}

function stopSessionCacheWatcher() {
  clearDebounceTimers();
  watchedRoots = [];
  watcherStarted = false;

  if (watcherInstance) {
    const pending = watcherInstance.close();
    watcherInstance = null;
    return pending;
  }

  return Promise.resolve();
}

function startSessionCacheWatcher(config, cache) {
  if (watcherStarted && watcherInstance) {
    return { enabled: true, reused: true };
  }

  if (process.env.CCTOOLBOX_DISABLE_CACHE_WATCHER === '1') {
    return { enabled: false, reason: 'disabled_by_env' };
  }

  const targets = buildWatchTargets(config);
  if (targets.length === 0) {
    return { enabled: false, reason: 'no_watchable_paths' };
  }

  try {
    watcherInstance = chokidar.watch(targets.map(item => item.path), {
      ignoreInitial: true,
      depth: 8,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });
  } catch (err) {
    console.warn('[CacheWatcher] File watcher not available, fallback to TTL only:', err.message);
    watcherInstance = null;
    watchedRoots = [];
    watcherStarted = false;
    return { enabled: false, reason: 'watcher_init_failed' };
  }

  watchedRoots = targets;

  const onFsEvent = (filePath) => {
    const channel = resolveChannelByFilePath(filePath);
    scheduleInvalidate(cache, channel);
  };

  watcherInstance
    .on('add', onFsEvent)
    .on('change', onFsEvent)
    .on('unlink', onFsEvent)
    .on('addDir', onFsEvent)
    .on('unlinkDir', onFsEvent)
    .on('error', (err) => {
      console.warn('[CacheWatcher] Watch error, fallback to TTL only:', err.message);
      stopSessionCacheWatcher().catch(() => {});
    });

  watcherStarted = true;
  return {
    enabled: true,
    watched: targets.map(item => item.path)
  };
}

module.exports = {
  startSessionCacheWatcher,
  stopSessionCacheWatcher
};
