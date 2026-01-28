/**
 * Skills 技能服务
 *
 * 管理 Claude Code Skills 的获取、安装、卸载
 * Skills 安装目录: ~/.claude/skills/
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const AdmZip = require('adm-zip');
const semver = require('semver');
const pLimit = require('p-limit');
const { getAppDir } = require('../../utils/app-path-manager');
const { loadConfig, expandHome } = require('../../config/loader');
const { GitHubClient } = require('./github-client');

// 默认仓库源 - 只预设官方仓库，其他由用户手动添加
const DEFAULT_REPOS = [
  { owner: 'anthropics', name: 'skills', branch: 'main', enabled: true }
];

// 缓存有效期（5分钟）
const CACHE_TTL = 5 * 60 * 1000;

const SKILL_CACHE_METADATA = 'metadata.json';
const SKILL_CACHE_MIN_SPACE = 100 * 1024 * 1024; // 100MB
const DEFAULT_SKILL_CACHE_TTL = 5 * 60 * 1000;
const DEFAULT_SKILL_CACHE_MAX_SIZE = 100;
const UPDATE_CHECK_CACHE_TTL = 5 * 60 * 1000;
const SKILL_UPDATE_CONFIG_FILE = 'skill-updates.json';

const CACHE_ERROR_MESSAGES = {
  ENOSPC: '缓存失败：磁盘空间不足，请清理磁盘后重试',
  EACCES: '缓存失败：无写入权限，请检查目录权限',
  ENOENT: '缓存失败：目录不存在或已被删除',
  EEXIST: '安装失败：目标位置已存在同名 Skill，请先删除'
};

class LRUSkillCache {
  constructor(maxSize = DEFAULT_SKILL_CACHE_MAX_SIZE, ttl = DEFAULT_SKILL_CACHE_TTL) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const entry = this.cache.get(key);
    if (!entry || typeof entry.time !== 'number') {
      this.cache.delete(key);
      return undefined;
    }
    if (this.ttl > 0 && (Date.now() - entry.time > this.ttl)) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, time: Date.now() });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

function buildSkillError(message, code, extra = {}) {
  const error = new Error(message);
  if (code) {
    error.code = code;
  }
  Object.assign(error, extra);
  return error;
}

// 多平台配置
const PLATFORMS = {
  claude: {
    id: 'claude',
    name: 'Claude',
    dir: path.join(os.homedir(), '.claude', 'skills'),
    color: '#FF6B35'
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    dir: path.join(os.homedir(), '.codex', 'skills'),
    color: '#4CAF50'
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    dir: path.join(os.homedir(), '.gemini', 'skills'),
    color: '#2196F3'
  }
};

class SkillService {
  constructor() {
    // 保留 installDir 用于向后兼容（默认 Claude 平台）
    this.installDir = path.join(os.homedir(), '.claude', 'skills');
    this.configDir = getAppDir();
    this.reposConfigPath = path.join(this.configDir, 'skill-repos.json');
    this.cachePath = path.join(this.configDir, 'skills-cache.json');
    this.skillUpdateConfigPath = path.join(this.configDir, SKILL_UPDATE_CONFIG_FILE);
    this.skillCacheConfig = this.resolveSkillCacheConfig();
    this.skillCacheDir = this.skillCacheConfig.dir;
    this.cachedMetaCache = new LRUSkillCache(
      this.skillCacheConfig.maxSize,
      this.skillCacheConfig.ttl
    );

    // 多平台配置
    this.platforms = PLATFORMS;

    // 内存缓存
    this.skillsCache = null;
    this.cacheTime = 0;
    this.lastRepoWarnings = [];
    this.githubClient = null;
    this.uploadLimiter = pLimit(3);
    this.updateCheckLimiter = pLimit(3);
    this.skillLocks = new Map();
    this.updateCheckCache = new Map();
    this.skillUpdateCache = null;

    // 确保目录存在
    this.ensureDirs();
  }

  getGitHubClient() {
    if (!this.githubClient) {
      this.githubClient = new GitHubClient({ token: this.getGitHubToken() });
    }
    return this.githubClient;
  }

  async withSkillLock(directory, task) {
    if (!directory) {
      return task();
    }
    const key = this.getDirectoryKey(directory);
    const pending = this.skillLocks.get(key);
    let release = null;
    const currentLock = new Promise(resolve => {
      release = resolve;
    });
    this.skillLocks.set(key, currentLock);
    if (pending) {
      await pending;
    }
    try {
      return await task();
    } finally {
      release();
      if (this.skillLocks.get(key) === currentLock) {
        this.skillLocks.delete(key);
      }
    }
  }

  ensureDirs() {
    // 确保配置目录存在
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    // 确保默认安装目录存在（Claude）
    if (!fs.existsSync(this.installDir)) {
      fs.mkdirSync(this.installDir, { recursive: true });
    }
  }

  resolveSkillCacheConfig() {
    const config = loadConfig();
    const rawConfig = config?.skillCache || {};
    const resolvedDir = expandHome(rawConfig.dir || path.join(this.configDir, 'skill-cache'));
    return {
      dir: resolvedDir,
      ttl: Number(rawConfig.ttl) || DEFAULT_SKILL_CACHE_TTL,
      maxSize: Number(rawConfig.maxSize) || DEFAULT_SKILL_CACHE_MAX_SIZE
    };
  }

  /**
   * 确保指定平台目录存在
   * @param {string} dir - 目录路径
   */
  ensurePlatformDir(dir) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new Error(`Permission denied: Cannot create ${dir}`);
      }
      throw err;
    }
  }

  /**
   * 确保缓存目录存在
   */
  ensureCacheDir() {
    try {
      if (!fs.existsSync(this.skillCacheDir)) {
        fs.mkdirSync(this.skillCacheDir, { recursive: true });
      }
    } catch (err) {
      throw buildSkillError(
        CACHE_ERROR_MESSAGES[err.code] || `缓存目录创建失败: ${err.message}`,
        err.code || 'CACHE_DIR_ERROR'
      );
    }
  }

  /**
   * 生成技能目录去重 key（使用目录名最后一段）
   */
  getDirectoryKey(directory) {
    return directory.split('/').pop().toLowerCase();
  }

  /**
   * 归一化安装目录，避免出现 skills/skills 的嵌套
   */
  normalizeInstallDirectory(directory) {
    if (!directory) return directory;
    let normalized = directory.replace(/\\/g, '/');
    while (normalized.startsWith('skills/')) {
      normalized = normalized.slice('skills/'.length);
    }
    return normalized || directory;
  }

  /**
   * 获取目录候选项（原始 + 归一化）
   */
  getDirectoryCandidates(directory) {
    const normalized = this.normalizeInstallDirectory(directory);
    if (normalized && normalized !== directory) {
      return [directory, normalized];
    }
    return [directory];
  }

  /**
   * 解析缓存目录路径
   */
  resolveCacheDirectory(directory) {
    const normalized = this.normalizeInstallDirectory(directory) || directory;
    const relative = normalized.replace(/\\/g, '/');
    if (relative.split('/').some(segment => segment === '..')) {
      throw buildSkillError('缓存目录非法，已阻止访问', 'INVALID_CACHE_PATH');
    }
    const cacheRoot = path.resolve(this.skillCacheDir);
    const resolved = path.resolve(cacheRoot, relative);
    const relPath = path.relative(cacheRoot, resolved);
    if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
      throw buildSkillError('缓存目录非法，已阻止访问', 'INVALID_CACHE_PATH');
    }
    return resolved;
  }

  /**
   * 检查缓存空间
   */
  ensureCacheSpace() {
    if (typeof fs.statfsSync !== 'function') return;
    try {
      const stats = fs.statfsSync(this.skillCacheDir);
      const available = stats.bavail * stats.bsize;
      if (available < SKILL_CACHE_MIN_SPACE) {
        throw buildSkillError(CACHE_ERROR_MESSAGES.ENOSPC, 'ENOSPC', {
          fallbackAvailable: true
        });
      }
    } catch (err) {
      if (err.code === 'EACCES') {
        throw buildSkillError(CACHE_ERROR_MESSAGES.EACCES, 'EACCES', {
          fallbackAvailable: true
        });
      }
    }
  }

  /**
   * 确保上传解压空间充足
   */
  ensureUploadSpace(baseDir, requiredBytes) {
    if (!baseDir || typeof fs.statfsSync !== 'function' || !requiredBytes) return;
    try {
      const stats = fs.statfsSync(baseDir);
      const available = stats.bavail * stats.bsize;
      if (available < requiredBytes) {
        throw buildSkillError('磁盘空间不足', 'ENOSPC');
      }
    } catch (err) {
      if (err.code === 'EACCES') {
        throw buildSkillError(CACHE_ERROR_MESSAGES.EACCES, 'EACCES');
      }
      if (err.code === 'ENOSPC') {
        throw err;
      }
    }
  }

  /**
   * 查找本地已安装技能目录（存在 SKILL.md）
   */
  resolveInstalledSkillDir(platform, directory) {
    const candidates = this.getDirectoryCandidates(directory);
    for (const candidate of candidates) {
      const skillDir = path.join(platform.dir, candidate);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        return skillDir;
      }
    }
    return null;
  }

  /**
   * 检查平台上目录是否已存在（避免重复创建）
   */
  isSkillDirPresent(platform, directory) {
    const candidates = this.getDirectoryCandidates(directory);
    return candidates.some(candidate => fs.existsSync(path.join(platform.dir, candidate)));
  }

  /**
   * 清理残留的技能目录（目录存在但缺少 SKILL.md）
   */
  cleanupStaleSkillDirs(platform, directory) {
    const candidates = this.getDirectoryCandidates(directory);
    let removed = false;
    for (const candidate of candidates) {
      const skillDir = path.join(platform.dir, candidate);
      if (!fs.existsSync(skillDir)) continue;
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) continue;
      fs.rmSync(skillDir, { recursive: true, force: true });
      removed = true;
    }
    return removed;
  }

  /**
   * 获取平台列表及其目录状态
   */
  getPlatforms() {
    const result = [];
    for (const [id, platform] of Object.entries(this.platforms)) {
      result.push({
        id: platform.id,
        name: platform.name,
        color: platform.color,
        exists: fs.existsSync(platform.dir)
      });
    }
    return result;
  }

  /**
   * 加载仓库配置
   */
  loadRepos() {
    try {
      if (fs.existsSync(this.reposConfigPath)) {
        const data = JSON.parse(fs.readFileSync(this.reposConfigPath, 'utf-8'));
        return data.repos || DEFAULT_REPOS;
      }
    } catch (err) {
      console.error('[SkillService] Load repos config error:', err.message);
    }
    return DEFAULT_REPOS;
  }

  /**
   * 保存仓库配置
   */
  saveRepos(repos) {
    fs.writeFileSync(this.reposConfigPath, JSON.stringify({ repos }, null, 2));
  }

  /**
   * 读取技能更新源配置
   */
  loadSkillUpdateConfig() {
    if (this.skillUpdateCache) {
      return this.skillUpdateCache;
    }

    const config = { skills: {} };
    try {
      if (!fs.existsSync(this.skillUpdateConfigPath)) {
        this.skillUpdateCache = config;
        return config;
      }
      const raw = JSON.parse(fs.readFileSync(this.skillUpdateConfigPath, 'utf-8'));
      const entries = raw && typeof raw === 'object'
        ? (raw.skills && typeof raw.skills === 'object' ? raw.skills : raw)
        : {};
      for (const [key, value] of Object.entries(entries || {})) {
        if (!value || typeof value !== 'object') continue;
        const directory = value.directory || key;
        if (!directory) continue;
        const entryKey = this.getDirectoryKey(directory);
        config.skills[entryKey] = {
          directory,
          repoOwner: value.repoOwner || value.owner || null,
          repoName: value.repoName || value.name || null,
          repoBranch: value.repoBranch || value.branch || null,
          lastAppliedVersion: value.lastAppliedVersion || null,
          lastCheckedAt: value.lastCheckedAt || null,
          hasUpdate: Boolean(value.hasUpdate),
          latestVersion: value.latestVersion || null,
          error: value.error || null
        };
      }
    } catch (err) {
      console.warn('[SkillService] Load update config error:', err.message);
    }

    this.skillUpdateCache = config;
    return config;
  }

  /**
   * 保存技能更新源配置
   */
  saveSkillUpdateConfig(config) {
    this.skillUpdateCache = config;
    try {
      fs.writeFileSync(this.skillUpdateConfigPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.warn('[SkillService] Save update config error:', err.message);
    }
  }

  /**
   * 合并技能更新状态到列表数据
   */
  applyUpdateStatus(skills) {
    const config = this.loadSkillUpdateConfig();
    const entries = config.skills || {};
    for (const skill of skills) {
      const key = this.getDirectoryKey(skill.directory);
      const entry = entries[key];
      if (entry && entry.repoOwner && entry.repoName) {
        skill.update = { ...entry };
      } else {
        skill.update = null;
      }
    }
  }

  /**
   * 使技能缓存失效，确保仓库变更后及时刷新列表
   */
  invalidateSkillsCache() {
    this.skillsCache = null;
    this.cacheTime = 0;
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
    } catch (err) {
      console.warn('[SkillService] Failed to delete cache file:', err.message);
    }
  }

  /**
   * 记录仓库提示信息，避免重复
   */
  addRepoWarning(repo, message) {
    const repoKey = `${repo.owner}/${repo.name}`;
    const warnings = this.lastRepoWarnings || [];
    if (!warnings.some(item => item.repo === repoKey && item.message === message)) {
      warnings.push({ repo: repoKey, message });
    }
    this.lastRepoWarnings = warnings;
  }

  /**
   * 获取最近一次列表拉取的仓库提示
   */
  getLastRepoWarnings() {
    return this.lastRepoWarnings || [];
  }

  /**
   * 判断是否为 GitHub 404 错误
   */
  isGitHubNotFoundError(err) {
    return Boolean(err && err.message && err.message.includes('GitHub API error: 404'));
  }

  /**
   * 获取仓库默认分支
   */
  async getRepoDefaultBranch(owner, name) {
    try {
      const repoInfo = await this.fetchGitHubApi(`https://api.github.com/repos/${owner}/${name}`);
      return repoInfo?.default_branch || null;
    } catch (err) {
      return null;
    }
  }

  /**
   * 更新仓库分支配置
   */
  updateRepoBranch(owner, name, branch) {
    const repos = this.loadRepos();
    const repo = repos.find(item => item.owner === owner && item.name === name);
    if (repo && repo.branch !== branch) {
      repo.branch = branch;
      this.saveRepos(repos);
      this.invalidateSkillsCache();
    }
  }

  /**
   * 添加仓库
   */
  addRepo(repo) {
    const repos = this.loadRepos();
    const existingIndex = repos.findIndex(r => r.owner === repo.owner && r.name === repo.name);

    if (existingIndex >= 0) {
      repos[existingIndex] = repo;
    } else {
      repos.push(repo);
    }

    this.saveRepos(repos);
    this.invalidateSkillsCache();
    return repos;
  }

  /**
   * 删除仓库
   */
  removeRepo(owner, name) {
    const repos = this.loadRepos();
    const filtered = repos.filter(r => !(r.owner === owner && r.name === name));
    this.saveRepos(filtered);
    this.invalidateSkillsCache();
    return filtered;
  }

  /**
   * 切换仓库启用状态
   */
  toggleRepo(owner, name, enabled) {
    const repos = this.loadRepos();
    const repo = repos.find(r => r.owner === owner && r.name === name);
    if (repo) {
      repo.enabled = enabled;
      this.saveRepos(repos);
      this.invalidateSkillsCache();
    }
    return repos;
  }

  /**
   * 获取所有技能列表（带缓存）
   */
  async listSkills(forceRefresh = false) {
    this.lastRepoWarnings = [];
    // 强制刷新时清除缓存
    if (forceRefresh) {
      this.invalidateSkillsCache();
    }

    // 检查内存缓存
    if (!forceRefresh && this.skillsCache && (Date.now() - this.cacheTime < CACHE_TTL)) {
      this.mergeCachedSkills(this.skillsCache);
      this.updateInstallStatus(this.skillsCache);
      this.applyUpdateStatus(this.skillsCache);
      return this.skillsCache;
    }

    // 检查文件缓存
    if (!forceRefresh) {
      const fileCache = this.loadCacheFromFile();
      if (fileCache) {
        this.skillsCache = fileCache;
        this.cacheTime = Date.now();
        this.mergeCachedSkills(this.skillsCache);
        this.updateInstallStatus(this.skillsCache);
        this.applyUpdateStatus(this.skillsCache);
        return this.skillsCache;
      }
    }

    const repos = this.loadRepos();
    const skills = [];

    // 并行获取所有启用仓库的技能（带超时保护）
    const enabledRepos = repos.filter(r => r.enabled);

    if (enabledRepos.length > 0) {
      const results = await Promise.allSettled(
        enabledRepos.map(repo =>
          Promise.race([
            this.fetchRepoSkills(repo),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Fetch timeout')), 30000)  // 30秒超时
            )
          ])
        )
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const repo = enabledRepos[i];
        const repoInfo = `${repo.owner}/${repo.name}`;
        if (result.status === 'fulfilled') {
          skills.push(...result.value);
        } else {
          const reason = result.reason?.message || '未知错误';
          let warningMessage = `拉取失败：${reason}`;
          if (reason === 'Fetch timeout') {
            warningMessage = '拉取超时，请稍后重试或检查网络/代理';
          } else if (reason.includes('GitHub API error: 403')) {
            warningMessage = 'GitHub API 限流或无权限访问';
          } else if (reason.includes('GitHub API error: 404')) {
            warningMessage = '仓库不存在、无权限访问或分支不可用';
          }
          this.addRepoWarning(repo, warningMessage);
          console.warn(`[SkillService] Fetch repo ${repoInfo} failed:`, reason);
        }
      }
    }

    // 合并本地已安装的技能
    this.mergeLocalSkills(skills);
    // 合并缓存技能（已禁用但未安装）
    this.mergeCachedSkills(skills);

    // 去重并排序
    this.deduplicateSkills(skills);
    skills.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    this.applyUpdateStatus(skills);

    // 更新缓存
    this.skillsCache = skills;
    this.cacheTime = Date.now();
    this.saveCacheToFile(skills);

    return skills;
  }

  /**
   * 从文件加载缓存
   */
  loadCacheFromFile() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
        if (data.time && (Date.now() - data.time < CACHE_TTL)) {
          return data.skills;
        }
      }
    } catch (err) {
      // 忽略缓存读取错误
    }
    return null;
  }

  /**
   * 保存缓存到文件
   */
  saveCacheToFile(skills) {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify({
        time: Date.now(),
        skills
      }));
    } catch (err) {
      // 忽略缓存写入错误
    }
  }

  /**
   * 读取缓存 metadata.json
   */
  readCacheMetadata(directory, options = {}) {
    const key = this.getDirectoryKey(directory);
    const cached = this.cachedMetaCache.get(key);
    if (cached) return cached;

    const cacheDir = this.resolveCacheDirectory(directory);
    const metaPath = path.join(cacheDir, SKILL_CACHE_METADATA);
    if (!fs.existsSync(metaPath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const normalized = this.normalizeCacheMetadata(data, directory);
      this.cachedMetaCache.set(key, normalized);
      return normalized;
    } catch (err) {
      if (options.removeOnCorrupt) {
        this.removeCacheDir(cacheDir);
      }
      throw buildSkillError('缓存文件已损坏，Skill 已从缓存中移除', 'CACHE_CORRUPT');
    }
  }

  /**
   * 写入缓存 metadata.json
   */
  writeCacheMetadata(directory, metadata) {
    const cacheDir = this.resolveCacheDirectory(directory);
    const metaPath = path.join(cacheDir, SKILL_CACHE_METADATA);
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
    this.cachedMetaCache.set(this.getDirectoryKey(directory), metadata);
  }

  /**
   * 规范化缓存 metadata
   */
  normalizeCacheMetadata(data, directory) {
    return {
      directory,
      cachedAt: data.cachedAt || new Date().toISOString(),
      installedPlatforms: Array.isArray(data.installedPlatforms) ? data.installedPlatforms : [],
      source: data.source || null,
      metadata: data.metadata || {},
      isDisabled: Boolean(data.isDisabled),
      cacheAvailable: Boolean(data.cacheAvailable !== false),
      uninstalledAt: data.uninstalledAt || null,
      uninstalledPlatforms: Array.isArray(data.uninstalledPlatforms) ? data.uninstalledPlatforms : [],
      canReinstall: Boolean(data.canReinstall),
      reinstallExpiresAt: data.reinstallExpiresAt || null
    };
  }

  /**
   * 删除缓存目录
   */
  removeCacheDir(cacheDir) {
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch (err) {
      // 忽略删除错误
    }
  }

  /**
   * 更新技能的安装状态
   */
  updateInstallStatus(skills) {
    const cachedMap = this.getCachedSkillsMap();
    for (const skill of skills) {
      const key = this.getDirectoryKey(skill.directory);
      const cached = cachedMap.get(key);
      // 获取已安装的平台列表
      skill.installedPlatforms = this.getInstalledPlatforms(skill.directory);
      skill.installed = skill.installedPlatforms.length > 0;
      if (skill.installed) {
        skill.isDisabled = false;
        skill.cacheAvailable = false;
      } else if (cached) {
        skill.isDisabled = cached.isDisabled;
        skill.cacheAvailable = cached.cacheAvailable;
        skill.cachedAt = cached.cachedAt;
      } else {
        skill.isDisabled = false;
        skill.cacheAvailable = false;
      }
    }
  }

  /**
   * 获取缓存技能映射
   */
  getCachedSkillsMap() {
    const cachedList = this.listCached();
    const map = new Map();
    for (const cached of cachedList) {
      map.set(this.getDirectoryKey(cached.directory), cached);
    }
    return map;
  }

  /**
   * 合并缓存中的技能（用于展示已禁用但未安装的技能）
   */
  mergeCachedSkills(skills) {
    const cachedList = this.listCached();
    if (cachedList.length === 0) return;

    const existingIndex = new Map();
    skills.forEach((skill, index) => {
      existingIndex.set(this.getDirectoryKey(skill.directory), index);
    });

    for (const cached of cachedList) {
      const key = this.getDirectoryKey(cached.directory);
      const index = existingIndex.get(key);
      if (index !== undefined) {
        skills[index].isDisabled = cached.isDisabled;
        skills[index].cacheAvailable = cached.cacheAvailable;
        skills[index].cachedAt = cached.cachedAt;
        skills[index].uninstalledAt = cached.uninstalledAt || null;
        skills[index].canReinstall = Boolean(cached.canReinstall);
        skills[index].reinstallExpiresAt = cached.reinstallExpiresAt || null;
        continue;
      }

      const cachedName = cached.metadata?.name || cached.directory.split('/').pop();
      const cachedDescription = cached.metadata?.description || '';
      const source = cached.source || {};
      const repoOwner = source.repoOwner || null;
      const repoName = source.repoName || null;
      const repoBranch = source.repoBranch || 'main';

      skills.push({
        key: `cache:${cached.directory}`,
        name: cachedName,
        description: cachedDescription,
        directory: cached.directory,
        installed: false,
        installedPlatforms: [],
        isDisabled: cached.isDisabled,
        cacheAvailable: cached.cacheAvailable,
        cachedAt: cached.cachedAt,
        uninstalledAt: cached.uninstalledAt || null,
        canReinstall: Boolean(cached.canReinstall),
        reinstallExpiresAt: cached.reinstallExpiresAt || null,
        source: cached.source || null,
        readmeUrl: repoOwner && repoName
          ? `https://github.com/${repoOwner}/${repoName}/tree/${repoBranch}/${cached.directory}`
          : null,
        repoOwner,
        repoName,
        repoBranch
      });
    }
  }

  /**
   * 获取缓存技能列表
   */
  listCached() {
    if (!fs.existsSync(this.skillCacheDir)) {
      return [];
    }

    const cacheDirs = [];
    this.collectCachedDirs(this.skillCacheDir, cacheDirs);

    const result = [];
    for (const cacheDir of cacheDirs) {
      const relativeDir = path.relative(this.skillCacheDir, cacheDir).replace(/\\/g, '/');
      try {
        const metadata = this.readCacheMetadata(relativeDir, { removeOnCorrupt: true });
        if (!metadata) continue;
        metadata.cacheAvailable = this.hasCacheFiles(cacheDir);
        if (
          metadata.cacheAvailable
          && !metadata.isDisabled
          && !metadata.uninstalledAt
          && this.getInstalledPlatforms(metadata.directory).length === 0
        ) {
          const uninstalledAt = new Date().toISOString();
          metadata.uninstalledAt = uninstalledAt;
          metadata.reinstallExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          metadata.canReinstall = true;
          this.writeCacheMetadata(relativeDir, metadata);
        }
        result.push(metadata);
      } catch (err) {
        if (err.code !== 'CACHE_CORRUPT') {
          throw err;
        }
      }
    }

    result.sort((a, b) => new Date(b.cachedAt) - new Date(a.cachedAt));
    return result;
  }

  /**
   * 缓存技能目录
   */
  cacheSkill(directory, options = {}) {
    const installedPlatforms = options.installedPlatforms || this.getInstalledPlatforms(directory);
    if (installedPlatforms.length === 0) {
      throw buildSkillError('技能未安装，无法缓存', 'NOT_INSTALLED');
    }

    const sourcePlatformId = installedPlatforms[0];
    const sourcePlatform = this.platforms[sourcePlatformId];
    const sourceDir = sourcePlatform
      ? this.resolveInstalledSkillDir(sourcePlatform, directory)
      : null;

    if (!sourceDir) {
      throw buildSkillError('技能目录不存在，无法缓存', 'NOT_FOUND');
    }

    const cacheDir = this.resolveCacheDirectory(directory);
    const allowFallback = options.allowFallback === true;

    try {
      this.ensureCacheDir();
      this.ensureCacheSpace();
      this.removeCacheDir(cacheDir);
      fs.mkdirSync(cacheDir, { recursive: true });
      this.copyDirRecursive(sourceDir, cacheDir);

      const metadata = this.buildCacheMetadata(directory, sourceDir, {
        installedPlatforms,
        skill: options.skill,
        isDisabled: options.isDisabled,
        cacheAvailable: true,
        uninstalledAt: options.uninstalledAt || null,
        uninstalledPlatforms: options.uninstalledPlatforms || [],
        canReinstall: options.canReinstall || false,
        reinstallExpiresAt: options.reinstallExpiresAt || null
      });

      this.writeCacheMetadata(directory, metadata);
      return metadata;
    } catch (err) {
      if (err.code === 'CACHE_CORRUPT') throw err;
      const code = err.code || 'CACHE_ERROR';
      const message = CACHE_ERROR_MESSAGES[code] || err.message || '缓存失败';
      throw buildSkillError(message, code, { fallbackAvailable: allowFallback });
    }
  }

  /**
   * 从缓存恢复技能
   */
  restoreCache(directory, platforms = null, options = {}) {
    const metadata = this.readCacheMetadata(directory, { removeOnCorrupt: true });
    if (!metadata) {
      throw buildSkillError('缓存不存在，无法启用', 'CACHE_NOT_FOUND');
    }

    const cacheDir = this.resolveCacheDirectory(directory);
    if (!fs.existsSync(cacheDir) || !this.hasCacheFiles(cacheDir)) {
      throw buildSkillError('缓存不存在，无法启用', 'CACHE_NOT_FOUND');
    }

    const targetPlatforms = Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : (metadata.installedPlatforms || []);

    if (!Array.isArray(targetPlatforms) || targetPlatforms.length === 0) {
      throw buildSkillError('恢复失败：未找到可恢复的平台', 'INVALID_PLATFORM');
    }

    const allowCleanup = options.allowCleanup === true;

    // 目标位置已存在则阻止恢复
    for (const platformId of targetPlatforms) {
      const platform = this.platforms[platformId];
      if (!platform) continue;
      const installedDir = this.resolveInstalledSkillDir(platform, directory);
      if (installedDir) {
        throw buildSkillError(CACHE_ERROR_MESSAGES.EEXIST, 'EEXIST');
      }
      if (allowCleanup) {
        this.cleanupStaleSkillDirs(platform, directory);
      }
      if (this.isSkillDirPresent(platform, directory)) {
        throw buildSkillError(CACHE_ERROR_MESSAGES.EEXIST, 'EEXIST');
      }
    }

    const restoredPlatforms = [];
    try {
      for (const platformId of targetPlatforms) {
        const platform = this.platforms[platformId];
        if (!platform) continue;

        this.ensurePlatformDir(platform.dir);
        const dest = path.join(platform.dir, this.normalizeInstallDirectory(directory) || directory);
        fs.mkdirSync(dest, { recursive: true });
        this.copyDirRecursive(cacheDir, dest, {
          filter: (entry, srcPath) => !(srcPath === cacheDir && entry.name === SKILL_CACHE_METADATA)
        });
        restoredPlatforms.push(platformId);
      }
    } catch (err) {
      for (const platformId of restoredPlatforms) {
        const platform = this.platforms[platformId];
        if (!platform) continue;
        const dest = path.join(platform.dir, this.normalizeInstallDirectory(directory) || directory);
        try {
          fs.rmSync(dest, { recursive: true, force: true });
        } catch (e) {
          // 忽略回滚错误
        }
      }
      const code = err.code || 'RESTORE_ERROR';
      const message = CACHE_ERROR_MESSAGES[code] || err.message || '恢复失败';
      throw buildSkillError(message, code);
    }

    this.writeCacheMetadata(directory, {
      ...metadata,
      isDisabled: false,
      cacheAvailable: true
    });

    this.skillsCache = null;
    this.cacheTime = 0;

    return {
      success: true,
      restoredPlatforms
    };
  }

  /**
   * 禁用技能（缓存并卸载）
   */
  disableSkill(directory, options = {}) {
    const installedPlatforms = this.getInstalledPlatforms(directory);
    if (installedPlatforms.length === 0) {
      throw buildSkillError('技能未安装，无法禁用', 'NOT_INSTALLED');
    }
    const existingMetadata = this.readCacheMetadata(directory) || {};

    if (!options.skipCache) {
      this.cacheSkill(directory, {
        installedPlatforms,
        skill: options.skill,
        isDisabled: true,
        allowFallback: true,
        uninstalledAt: existingMetadata.uninstalledAt || null,
        uninstalledPlatforms: existingMetadata.uninstalledPlatforms || [],
        canReinstall: existingMetadata.canReinstall || false,
        reinstallExpiresAt: existingMetadata.reinstallExpiresAt || null
      });
    } else {
      this.ensureCacheDir();
      const sourcePlatform = this.platforms[installedPlatforms[0]];
      const sourceDir = sourcePlatform
        ? this.resolveInstalledSkillDir(sourcePlatform, directory)
        : null;
      const placeholder = this.buildCacheMetadata(directory, sourceDir, {
        installedPlatforms,
        skill: options.skill,
        isDisabled: true,
        cacheAvailable: false,
        uninstalledAt: existingMetadata.uninstalledAt || null,
        uninstalledPlatforms: existingMetadata.uninstalledPlatforms || [],
        canReinstall: existingMetadata.canReinstall || false,
        reinstallExpiresAt: existingMetadata.reinstallExpiresAt || null
      });
      try {
        const cacheDir = this.resolveCacheDirectory(directory);
        fs.mkdirSync(cacheDir, { recursive: true });
        this.writeCacheMetadata(directory, placeholder);
      } catch (err) {
        // 跳过缓存时允许降级，不阻止禁用流程
      }
    }

    const result = this.uninstallSkill(directory, installedPlatforms, { skipCache: true });
    return {
      success: true,
      ...result
    };
  }

  /**
   * 启用技能（从缓存恢复）
   */
  enableSkill(directory) {
    const metadata = this.readCacheMetadata(directory, { removeOnCorrupt: true });
    if (!metadata || !metadata.cacheAvailable) {
      throw buildSkillError('缓存不存在，无法启用', 'CACHE_NOT_FOUND');
    }

    const result = this.restoreCache(directory, metadata.installedPlatforms || []);
    return {
      success: true,
      ...result
    };
  }

  /**
   * 重新安装技能（从缓存恢复，24 小时内有效）
   */
  reinstallSkill(directory) {
    return this.withSkillLock(directory, () => {
      const metadata = this.readCacheMetadata(directory, { removeOnCorrupt: true });
      if (!metadata || !metadata.cacheAvailable) {
        throw buildSkillError('缓存不存在，无法重新安装', 'CACHE_NOT_FOUND');
      }

      if (!metadata.canReinstall || !metadata.reinstallExpiresAt) {
        throw buildSkillError('重新安装已过期', 'REINSTALL_EXPIRED');
      }

      const expiresAt = new Date(metadata.reinstallExpiresAt).getTime();
      if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
        this.writeCacheMetadata(directory, {
          ...metadata,
          canReinstall: false,
          uninstalledAt: null,
          reinstallExpiresAt: null,
          uninstalledPlatforms: []
        });
        throw buildSkillError('重新安装已过期', 'REINSTALL_EXPIRED');
      }

      const result = this.restoreCache(
        directory,
        metadata.installedPlatforms || [],
        { allowCleanup: true }
      );
      this.writeCacheMetadata(directory, {
        ...metadata,
        isDisabled: false,
        cacheAvailable: true,
        canReinstall: false,
        uninstalledAt: null,
        reinstallExpiresAt: null,
        uninstalledPlatforms: []
      });

      return {
        success: true,
        ...result
      };
    });
  }

  /**
   * 删除缓存技能
   */
  deleteCachedSkill(directory) {
    const cacheDir = this.resolveCacheDirectory(directory);
    if (!fs.existsSync(cacheDir)) {
      throw buildSkillError('缓存不存在', 'CACHE_NOT_FOUND');
    }
    this.removeCacheDir(cacheDir);
    this.cachedMetaCache.delete(this.getDirectoryKey(directory));
    return { success: true };
  }

  /**
   * 递归收集缓存目录
   */
  collectCachedDirs(currentDir, result) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    const hasMetadata = entries.some(entry => entry.isFile() && entry.name === SKILL_CACHE_METADATA);
    if (hasMetadata) {
      result.push(currentDir);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        this.collectCachedDirs(path.join(currentDir, entry.name), result);
      }
    }
  }

  /**
   * 判断缓存是否包含技能文件
   */
  hasCacheFiles(cacheDir) {
    try {
      const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
      return entries.some(entry => entry.name !== SKILL_CACHE_METADATA);
    } catch (err) {
      return false;
    }
  }

  /**
   * 构建缓存 metadata.json 数据
   */
  buildCacheMetadata(directory, sourceDir, options = {}) {
    const metadata = sourceDir ? this.readSkillMetadataFromDir(sourceDir) : {};
    const skill = options.skill;
    const repoOwner = skill?.repoOwner || null;
    const repoName = skill?.repoName || null;
    const repoBranch = skill?.repoBranch || 'main';

    const source = repoOwner && repoName
      ? {
        type: 'repository',
        repoOwner,
        repoName,
        repoBranch,
        repoUrl: `https://github.com/${repoOwner}/${repoName}`
      }
      : { type: 'local' };

    return {
      directory,
      cachedAt: new Date().toISOString(),
      installedPlatforms: options.installedPlatforms || [],
      source,
      metadata: {
        name: metadata.name || null,
        version: metadata.version || null,
        description: metadata.description || null
      },
      isDisabled: Boolean(options.isDisabled),
      cacheAvailable: options.cacheAvailable !== false,
      uninstalledAt: options.uninstalledAt || null,
      uninstalledPlatforms: Array.isArray(options.uninstalledPlatforms) ? options.uninstalledPlatforms : [],
      canReinstall: Boolean(options.canReinstall),
      reinstallExpiresAt: options.reinstallExpiresAt || null
    };
  }

  /**
   * 读取技能目录中的 SKILL.md 元数据
   */
  readSkillMetadataFromDir(skillDir) {
    try {
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) return {};
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      return this.parseSkillMd(content);
    } catch (err) {
      return {};
    }
  }

  /**
   * 校验 ZIP 内容安全性
   */
  validateZipEntries(zip) {
    const entries = zip.getEntries();
    if (entries.length === 0) {
      throw buildSkillError('ZIP 文件内容为空', 'INVALID_ZIP');
    }
    if (entries.length > 1000) {
      throw buildSkillError('ZIP 文件过大，请减少文件数量', 'INVALID_ZIP');
    }
    let totalSize = 0;
    let compressedSize = 0;
    for (const entry of entries) {
      const entryName = entry.entryName.replace(/\\/g, '/');
      if (entryName.startsWith('/') || entryName.includes('..')) {
        throw buildSkillError('ZIP 文件路径非法', 'INVALID_ZIP');
      }
      totalSize += entry.header?.size || 0;
      compressedSize += entry.header?.compressedSize || 0;
      if (totalSize > 1024 * 1024 * 1024) {
        throw buildSkillError('ZIP 文件内容过大，请检查内容大小', 'INVALID_ZIP');
      }
      if (compressedSize > 0 && totalSize / compressedSize > 100) {
        throw buildSkillError('ZIP 文件压缩比异常，可能存在风险', 'INVALID_ZIP');
      }
    }
    return totalSize;
  }

  /**
   * 查找包含 SKILL.md 的目录
   */
  findSkillRootDir(baseDir, options = {}) {
    const includeHidden = options.includeHidden === true;
    const stack = [baseDir];
    while (stack.length > 0) {
      const current = stack.pop();
      const skillMdPath = path.join(current, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        return current;
      }
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch (err) {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!includeHidden && entry.name.startsWith('.')) continue;
        if (includeHidden && (entry.name === '.git' || entry.name === 'node_modules')) continue;
        if (entry.name.startsWith('.DS_Store')) continue;
          stack.push(path.join(current, entry.name));
      }
    }
    return null;
  }

  /**
   * 在仓库目录中查找指定技能目录
   */
  findSkillDirInRepo(repoDir, directory) {
    const candidates = this.getDirectoryCandidates(directory)
      .map(item => item.replace(/\\/g, '/'));

    for (const candidate of candidates) {
      const fullPath = path.join(repoDir, candidate);
      const skillMdPath = path.join(fullPath, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        return fullPath;
      }
    }

    const targetKey = this.getDirectoryKey(directory);
    const stack = [repoDir];
    while (stack.length > 0) {
      const current = stack.pop();
      const skillMdPath = path.join(current, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const relPath = path.relative(repoDir, current).replace(/\\/g, '/');
        if (this.getDirectoryKey(relPath) === targetKey) {
          return current;
        }
      }

      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch (err) {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;
        stack.push(path.join(current, entry.name));
      }
    }

    return null;
  }

  /**
   * 归一化上传的相对路径
   */
  normalizeUploadRelativePath(input) {
    if (!input) return '';
    const normalized = input.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.includes('..')) return '';
    return normalized;
  }

  /**
   * 按上传文件列表复制目录内容（用于目录上传的兜底）
   */
  copyUploadedDirectoryFiles(uploadBaseDir, skillDir, files, dest) {
    let skillRelPath = this.normalizeUploadRelativePath(path.relative(uploadBaseDir, skillDir));
    if (skillRelPath === '.' || !skillRelPath) {
      skillRelPath = '';
    }

    let copied = 0;
    for (const file of files) {
      let relativePath = this.normalizeUploadRelativePath(file.originalname || '');
      if (!relativePath) {
        relativePath = this.normalizeUploadRelativePath(path.relative(uploadBaseDir, file.path));
      }
      if (!relativePath) continue;
      if (skillRelPath && !relativePath.startsWith(`${skillRelPath}/`)) {
        relativePath = `${skillRelPath}/${relativePath}`;
      }
      const subPath = skillRelPath ? relativePath.slice(skillRelPath.length + 1) : relativePath;
      if (!subPath) continue;
      const destPath = path.join(dest, subPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(file.path, destPath);
      copied += 1;
    }

    if (copied === 0) {
      this.copyDirRecursive(skillDir, dest);
    }
  }

  /**
   * 解析仓库输入
   */
  parseRepoInput(repo) {
    if (!repo || typeof repo !== 'string') return null;
    let input = repo.trim();
    if (!input) return null;
    let branch = null;

    if (input.includes('#')) {
      const parts = input.split('#');
      input = parts[0];
      branch = parts[1] ? parts[1].trim() : null;
    }

    if (input.startsWith('http://') || input.startsWith('https://')) {
      try {
        const url = new URL(input);
        const segments = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '').split('/');
        if (segments.length >= 2) {
          input = `${segments[0]}/${segments[1]}`;
          if (segments[2] === 'tree' && segments[3]) {
            branch = segments[3];
          }
        } else {
          return null;
        }
      } catch (err) {
        return null;
      }
    }

    const match = input.match(/^([^/]+)\/([^/]+)$/);
    if (!match) return null;
    return {
      owner: match[1],
      name: match[2],
      branch
    };
  }

  /**
   * 获取仓库最新版本
   */
  async getLatestRepoVersion(repoInfo, options = {}) {
    if (!repoInfo?.owner || !repoInfo?.name) {
      return null;
    }

    const cacheKey = `${repoInfo.owner}/${repoInfo.name}`.toLowerCase();
    const cached = this.updateCheckCache.get(cacheKey);
    if (!options.force && cached?.latestVersion && (Date.now() - cached.timestamp < UPDATE_CHECK_CACHE_TTL)) {
      return cached.latestVersion;
    }

    const githubClient = this.getGitHubClient();
    let tags = [];
    try {
      tags = await githubClient.fetchUpdates(repoInfo.owner, repoInfo.name);
    } catch (err) {
      throw buildSkillError('更新检测失败，请稍后重试', 'UPDATE_CHECK_FAILED');
    }

    const versions = tags
      .map(tag => {
        const raw = tag.name;
        const valid = semver.valid(raw);
        if (valid) return valid;
        const coerced = semver.coerce(raw);
        return coerced ? coerced.version : null;
      })
      .filter(Boolean)
      .sort(semver.rcompare);

    if (versions.length === 0) {
      return null;
    }

    const latestVersion = versions[0];
    this.updateCheckCache.set(cacheKey, {
      ...(cached || {}),
      latestVersion,
      timestamp: Date.now()
    });
    return latestVersion;
  }

  /**
   * 获取本地技能版本
   */
  getLocalSkillVersion(directory) {
    const installedPlatforms = this.getInstalledPlatforms(directory);
    const sourcePlatform = installedPlatforms.length > 0
      ? this.platforms[installedPlatforms[0]]
      : null;
    const installedDir = sourcePlatform
      ? this.resolveInstalledSkillDir(sourcePlatform, directory)
      : null;
    const localMeta = installedDir ? this.readSkillMetadataFromDir(installedDir) : {};
    const localVersion = semver.valid(localMeta.version)
      || (semver.coerce(localMeta.version)?.version)
      || '0.0.0';
    return { localVersion, installedPlatforms };
  }

  /**
   * 刷新技能更新状态
   */
  async refreshSkillUpdateStatus(entry, options = {}) {
    if (!entry || !entry.repoOwner || !entry.repoName) {
      return entry;
    }

    const checkedAt = new Date().toISOString();
    try {
      const latestVersion = options.latestVersion ?? await this.getLatestRepoVersion({
        owner: entry.repoOwner,
        name: entry.repoName
      }, options);
      const { localVersion, installedPlatforms } = this.getLocalSkillVersion(entry.directory);
      const appliedVersion = semver.valid(entry.lastAppliedVersion)
        || (semver.coerce(entry.lastAppliedVersion)?.version);
      entry.latestVersion = latestVersion || null;
      if (appliedVersion && latestVersion && semver.gte(appliedVersion, latestVersion)) {
        entry.hasUpdate = false;
      } else {
        entry.hasUpdate = Boolean(
          latestVersion
          && installedPlatforms.length > 0
          && semver.gt(latestVersion, localVersion)
        );
      }
      entry.lastCheckedAt = checkedAt;
      entry.error = null;
    } catch (err) {
      entry.lastCheckedAt = checkedAt;
      entry.hasUpdate = false;
      entry.error = err.message;
    }

    return entry;
  }

  /**
   * 设置技能更新源
   */
  async setSkillUpdateSource(directory, repoInput) {
    const normalized = this.normalizeInstallDirectory(directory) || directory;
    if (!normalized) {
      throw buildSkillError('缺少技能目录', 'MISSING_DIRECTORY');
    }

    const config = this.loadSkillUpdateConfig();
    const key = this.getDirectoryKey(normalized);

    if (!repoInput || !String(repoInput).trim()) {
      delete config.skills[key];
      this.saveSkillUpdateConfig(config);
      if (this.skillsCache) {
        this.applyUpdateStatus(this.skillsCache);
      }
      return { removed: true };
    }

    const repoInfo = this.parseRepoInput(repoInput);
    if (!repoInfo) {
      throw buildSkillError('仓库地址格式不正确', 'INVALID_REPO_URL');
    }

    const existing = config.skills[key];
    const entry = {
      directory: normalized,
      repoOwner: repoInfo.owner,
      repoName: repoInfo.name,
      repoBranch: repoInfo.branch
        || (existing?.repoOwner === repoInfo.owner && existing?.repoName === repoInfo.name
          ? existing.repoBranch
          : null),
      lastAppliedVersion: null,
      lastCheckedAt: null,
      hasUpdate: false,
      latestVersion: null,
      error: null
    };

    config.skills[key] = entry;
    await this.refreshSkillUpdateStatus(entry);
    this.saveSkillUpdateConfig(config);
    if (this.skillsCache) {
      this.applyUpdateStatus(this.skillsCache);
    }
    return entry;
  }

  /**
   * 启动时检查技能更新
   */
  async checkSkillUpdatesOnStartup() {
    const config = this.loadSkillUpdateConfig();
    const entries = Object.values(config.skills || {})
      .filter(item => item.repoOwner && item.repoName);
    if (entries.length === 0) {
      return { success: true, checked: 0 };
    }

    const limiter = this.updateCheckLimiter || ((fn) => fn());
    const tasks = entries.map(entry => limiter(async () => {
      await this.refreshSkillUpdateStatus(entry, { force: true });
    }));
    await Promise.allSettled(tasks);

    this.saveSkillUpdateConfig(config);
    if (this.skillsCache) {
      this.applyUpdateStatus(this.skillsCache);
    }
    return { success: true, checked: entries.length };
  }

  /**
   * 按更新源执行技能更新
   */
  async updateSkillFromSource(directory) {
    const normalized = this.normalizeInstallDirectory(directory) || directory;
    if (!normalized) {
      throw buildSkillError('缺少技能目录', 'MISSING_DIRECTORY');
    }

    const config = this.loadSkillUpdateConfig();
    const key = this.getDirectoryKey(normalized);
    const entry = config.skills[key];
    if (!entry || !entry.repoOwner || !entry.repoName) {
      throw buildSkillError('未配置更新源', 'UPDATE_SOURCE_NOT_FOUND');
    }

    return this.withSkillLock(normalized, async () => {
      const targetPlatforms = this.getInstalledPlatforms(normalized);
      if (targetPlatforms.length === 0) {
        throw buildSkillError('技能未安装，无法更新', 'SKILL_NOT_INSTALLED');
      }

      const repo = {
        owner: entry.repoOwner,
        name: entry.repoName,
        branch: entry.repoBranch || 'main'
      };

      const latestVersion = await this.getLatestRepoVersion(repo, { force: true });
      this.uninstallSkill(normalized, targetPlatforms, { skipCache: true });
      const result = await this.installSkill(normalized, repo, targetPlatforms);
      if (latestVersion) {
        entry.lastAppliedVersion = latestVersion;
      }
      await this.refreshSkillUpdateStatus(entry, { force: true, latestVersion });
      this.saveSkillUpdateConfig(config);
      if (this.skillsCache) {
        this.applyUpdateStatus(this.skillsCache);
      }
      return {
        success: true,
        ...result
      };
    });
  }

  /**
   * 从 GitHub 仓库获取技能列表（使用 Tree API 一次性获取）
   */
  async fetchRepoSkills(repo) {
    const branch = repo.branch || 'main';

    try {
      return await this.fetchRepoSkillsForBranch(repo, branch);
    } catch (err) {
      if (this.isGitHubNotFoundError(err)) {
        const defaultBranch = await this.getRepoDefaultBranch(repo.owner, repo.name);
        if (defaultBranch && defaultBranch !== branch) {
          this.addRepoWarning(
            repo,
            `分支 ${branch} 不存在，已自动切换为默认分支 ${defaultBranch}`
          );
          this.updateRepoBranch(repo.owner, repo.name, defaultBranch);
          return await this.fetchRepoSkillsForBranch(repo, defaultBranch);
        }
      }
      console.error(`[SkillService] Fetch repo ${repo.owner}/${repo.name} error:`, err.message);
      throw err;
    }
  }

  /**
   * 按指定分支获取仓库技能
   */
  async fetchRepoSkillsForBranch(repo, branch) {
    const skills = [];
    const targetRepo = { ...repo, branch };

    // 使用 GitHub Tree API 一次性获取所有文件
    const treeUrl = `https://api.github.com/repos/${targetRepo.owner}/${targetRepo.name}/git/trees/${branch}?recursive=1`;
    const tree = await this.fetchGitHubApi(treeUrl);

    if (!tree || !tree.tree) {
      console.warn(`[SkillService] Empty tree for ${targetRepo.owner}/${targetRepo.name}`);
      return skills;
    }

    // 找到所有 SKILL.md 文件
    const skillFiles = tree.tree.filter(item =>
      item.type === 'blob' && item.path.endsWith('/SKILL.md')
    );

    // 并行获取所有 SKILL.md 的内容（限制并发数）
    const batchSize = 5;

    for (let i = 0; i < skillFiles.length; i += batchSize) {
      const batch = skillFiles.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(file => this.fetchAndParseSkill(file, targetRepo))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          skills.push(result.value);
        }
      }
    }

    return skills;
  }

  /**
   * 获取并解析单个 SKILL.md
   */
  async fetchAndParseSkill(file, repo) {
    try {
      // 从路径提取目录名 (e.g., "algorithmic-art/SKILL.md" -> "algorithmic-art")
      const directory = file.path.replace(/\/SKILL\.md$/, '');

      // 使用 raw.githubusercontent.com 获取文件内容（不消耗 API 限额）
      const content = await this.fetchBlobContent(file.sha, repo, file.path);
      const metadata = this.parseSkillMd(content);

      // 获取已安装的平台列表
      const installedPlatforms = this.getInstalledPlatforms(directory);

      return {
        key: `${repo.owner}/${repo.name}:${directory}`,
        name: metadata.name || directory.split('/').pop(),
        description: metadata.description || '',
        directory,
        installed: installedPlatforms.length > 0,
        installedPlatforms,
        readmeUrl: `https://github.com/${repo.owner}/${repo.name}/tree/${repo.branch}/${directory}`,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoBranch: repo.branch,
        license: metadata.license
      };
    } catch (err) {
      console.warn(`[SkillService] Parse skill ${file.path} error:`, err.message);
      return null;
    }
  }

  /**
   * 使用 raw.githubusercontent.com 获取文件内容（不消耗 API 限额）
   */
  async fetchBlobContent(sha, repo, filePath) {
    // raw.githubusercontent.com 不走 API 限流
    const url = `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repo.branch}/${filePath}`;

    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'cc-cli-skill-service'
        },
        timeout: 15000
      }, (res) => {
        // 处理重定向
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            https.get(redirectUrl, {
              headers: { 'User-Agent': 'cc-cli-skill-service' },
              timeout: 15000
            }, (res2) => {
              let data = '';
              res2.on('data', chunk => data += chunk);
              res2.on('end', () => {
                if (res2.statusCode === 200) {
                  resolve(data);
                } else {
                  reject(new Error(`Raw fetch error: ${res2.statusCode}`));
                }
              });
            }).on('error', reject);
            return;
          }
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`Raw fetch error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Raw fetch timeout'));
      });
    });
  }

  /**
   * 获取 GitHub Token（从环境变量或配置文件）
   */
  getGitHubToken() {
    // 优先从环境变量获取
    if (process.env.GITHUB_TOKEN) {
      return process.env.GITHUB_TOKEN;
    }
    // 从配置文件获取
    try {
      const configPath = path.join(this.configDir, 'github-token.txt');
      if (fs.existsSync(configPath)) {
        return fs.readFileSync(configPath, 'utf-8').trim();
      }
    } catch (err) {
      // ignore
    }
    return null;
  }

  /**
   * 通用 GitHub API 请求
   */
  async fetchGitHubApi(url) {
    const token = this.getGitHubToken();
    const headers = {
      'User-Agent': 'cc-cli-skill-service',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers,
        timeout: 15000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 使用 GitHub API 获取目录内容
   */
  async fetchGitHubContents(owner, name, path, branch) {
    const url = `https://api.github.com/repos/${owner}/${name}/contents/${path}?ref=${branch}`;

    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'cc-cli-skill-service',
          'Accept': 'application/vnd.github.v3+json'
        },
        timeout: 15000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON response'));
            }
          } else if (res.statusCode === 404) {
            resolve([]);
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 递归扫描仓库内容查找 SKILL.md
   */
  async scanRepoContents(contents, repo, currentPath, skills) {
    if (!Array.isArray(contents)) return;

    // 检查当前目录是否有 SKILL.md
    const skillMd = contents.find(item => item.name === 'SKILL.md' && item.type === 'file');

    if (skillMd) {
      // 找到技能，解析元数据
      try {
        const skillContent = await this.fetchFileContent(skillMd.download_url);
        const metadata = this.parseSkillMd(skillContent);

        const directory = currentPath || repo.name;

        skills.push({
          key: `${repo.owner}/${repo.name}:${directory}`,
          name: metadata.name || directory,
          description: metadata.description || '',
          directory,
          installed: this.isInstalled(directory),
          readmeUrl: `https://github.com/${repo.owner}/${repo.name}/tree/${repo.branch}/${currentPath}`,
          repoOwner: repo.owner,
          repoName: repo.name,
          repoBranch: repo.branch,
          license: metadata.license
        });
      } catch (err) {
        console.warn(`[SkillService] Parse SKILL.md at ${currentPath} error:`, err.message);
      }

      // 找到 SKILL.md 后不再递归子目录
      return;
    }

    // 递归扫描子目录
    const dirs = contents.filter(item => item.type === 'dir');
    for (const dir of dirs) {
      // 跳过隐藏目录和特殊目录
      if (dir.name.startsWith('.') || dir.name === 'node_modules') continue;

      try {
        const subContents = await this.fetchGitHubContents(repo.owner, repo.name, dir.path, repo.branch);
        await this.scanRepoContents(subContents, repo, dir.path, skills);
      } catch (err) {
        // 忽略子目录错误，继续扫描
      }
    }
  }

  /**
   * 获取文件内容
   */
  async fetchFileContent(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, {
        headers: { 'User-Agent': 'cc-cli-skill-service' },
        timeout: 10000
      }, (res) => {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.fetchFileContent(res.headers.location).then(resolve).catch(reject);
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 解析 SKILL.md 文件
   */
  parseSkillMd(content) {
    const result = {
      name: null,
      description: null,
      version: null,
      license: null,
      allowedTools: [],
      metadata: {}
    };

    // 移除 BOM
    content = content.trim().replace(/^\uFEFF/, '');

    // 解析 YAML frontmatter
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return result;

    const frontmatter = match[1];

    // 简单解析 YAML
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // 去除引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      switch (key) {
        case 'name':
          result.name = value;
          break;
        case 'description':
          result.description = value;
          break;
        case 'version':
          result.version = value;
          break;
        case 'license':
          result.license = value;
          break;
      }
    }

    return result;
  }

  /**
   * 检查技能是否已安装
   */
  isInstalled(directory) {
    // 检查是否在任一平台安装
    for (const platform of Object.values(this.platforms)) {
      if (this.resolveInstalledSkillDir(platform, directory)) {
        return true;
      }
    }
    return false;
  }


  /**
   * 获取技能安装在哪些平台
   * @param {string} directory - 技能目录名
   * @returns {string[]} - 已安装的平台 ID 列表
   */
  getInstalledPlatforms(directory) {
    const installedPlatforms = [];
    for (const [platformId, platform] of Object.entries(this.platforms)) {
      if (this.resolveInstalledSkillDir(platform, directory)) {
        installedPlatforms.push(platformId);
      }
    }
    return installedPlatforms;
  }

  /**
   * 合并本地已安装的技能
   */
  mergeLocalSkills(skills) {
    // 扫描所有平台的技能目录
    for (const [platformId, platform] of Object.entries(this.platforms)) {
      if (fs.existsSync(platform.dir)) {
        this.scanLocalDir(platform.dir, platform.dir, skills, platformId);
      }
    }
  }

  /**
   * 递归扫描本地目录
   */
  scanLocalDir(currentDir, baseDir, skills, platformId = 'claude') {
    const skillMdPath = path.join(currentDir, 'SKILL.md');

    if (fs.existsSync(skillMdPath)) {
      const directory = currentDir === baseDir
        ? path.basename(currentDir)
        : path.relative(baseDir, currentDir);

      // 检查是否已在列表中（比较目录名，去掉前缀路径）
      const dirName = directory.split('/').pop().toLowerCase();
      const existing = skills.find(s => {
        const remoteDirName = s.directory.split('/').pop().toLowerCase();
        return remoteDirName === dirName;
      });

      if (existing) {
        existing.installed = true;
        // 添加平台到已安装平台列表
        if (!existing.installedPlatforms) {
          existing.installedPlatforms = [];
        }
        if (!existing.installedPlatforms.includes(platformId)) {
          existing.installedPlatforms.push(platformId);
        }
      } else {
        // 添加本地独有的技能
        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const metadata = this.parseSkillMd(content);

          skills.push({
            key: `local:${directory}`,
            name: metadata.name || directory,
            description: metadata.description || '',
            directory,
            installed: true,
            installedPlatforms: [platformId],
            readmeUrl: null,
            repoOwner: null,
            repoName: null,
            repoBranch: null,
            license: metadata.license
          });
        } catch (err) {
          console.warn(`[SkillService] Parse local skill ${directory} error:`, err.message);
        }
      }

      return; // 找到 SKILL.md 后不再递归
    }

    // 递归子目录
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          this.scanLocalDir(path.join(currentDir, entry.name), baseDir, skills, platformId);
        }
      }
    } catch (err) {
      // 忽略读取错误
    }
  }

  /**
   * 去重技能列表
   */
  deduplicateSkills(skills) {
    const seen = new Map();

    for (let i = skills.length - 1; i >= 0; i--) {
      const skill = skills[i];
      // 使用目录名（不含路径前缀）作为去重 key
      const key = skill.directory.split('/').pop().toLowerCase();

      if (seen.has(key)) {
        // 保留已安装的版本
        const existingIndex = seen.get(key);
        if (skill.installed && !skills[existingIndex].installed) {
          skills.splice(existingIndex, 1);
          seen.set(key, i - 1);
        } else {
          skills.splice(i, 1);
        }
      } else {
        seen.set(key, i);
      }
    }
  }

  /**
   * 上传并安装技能（ZIP 或文件夹）
   * @param {object|object[]} file - Multer 上传对象
   * @param {object} options - 选项 { force, platforms, uploadType, uploadBaseDir }
   */
  async uploadSkill(file, options = {}) {
    const files = Array.isArray(file) ? file : (file ? [file] : []);
    if (files.length === 0) {
      throw buildSkillError('未检测到上传文件', 'NO_FILE');
    }

    const uploadType = options.uploadType
      || (files.length === 1 && path.extname(files[0].originalname || '').toLowerCase() === '.zip'
        ? 'zip'
        : 'directory');
    const uploadBaseDir = options.uploadBaseDir || path.dirname(files[0].path);
    const force = Boolean(options.force);

    let workDir = uploadBaseDir;
    try {
      if (uploadType === 'zip') {
        const zipFile = files[0];
        let zip = null;
        try {
          zip = new AdmZip(zipFile.path);
        } catch (err) {
          throw buildSkillError('ZIP 文件损坏,请检查文件完整性', 'INVALID_ZIP');
        }
        const totalSize = this.validateZipEntries(zip);
        this.ensureUploadSpace(uploadBaseDir, totalSize);

        const extractDir = path.join(uploadBaseDir, 'extract');
        fs.mkdirSync(extractDir, { recursive: true });
        zip.extractAllTo(extractDir, true);
        workDir = extractDir;
      } else {
        if (files.length > 1000) {
          throw buildSkillError('上传文件过多，请减少文件数量', 'INVALID_ZIP');
        }
        const totalSize = files.reduce((sum, item) => sum + (item.size || 0), 0);
        this.ensureUploadSpace(uploadBaseDir, totalSize);
        if (totalSize > 1024 * 1024 * 1024) {
          throw buildSkillError('解压后文件过大，请检查内容大小', 'INVALID_ZIP');
        }
      }

      const skillDir = this.findSkillRootDir(workDir, { includeHidden: true });
      if (!skillDir) {
        throw buildSkillError('未找到 SKILL.md', 'NO_SKILL_MD');
      }

      const metadata = this.readSkillMetadataFromDir(skillDir);
      let directory = path.relative(workDir, skillDir).replace(/\\/g, '/');
      if (!directory || directory === '.') {
        const originalName = files[0]?.originalname || '';
        directory = path.basename(originalName, path.extname(originalName)) || directory;
      }
      if (!directory || directory.includes('..')) {
        throw buildSkillError('技能目录非法', 'INVALID_ZIP');
      }

      const installDirectory = this.normalizeInstallDirectory(directory) || directory;
      const installTask = async () => {
        const installedBefore = this.getInstalledPlatforms(installDirectory);
        const targetPlatforms = Array.isArray(options.platforms) && options.platforms.length > 0
          ? options.platforms
          : (installedBefore.length > 0 ? installedBefore : ['claude']);

        if (installedBefore.length > 0) {
          const sourcePlatform = this.platforms[installedBefore[0]];
          const installedDir = sourcePlatform
            ? this.resolveInstalledSkillDir(sourcePlatform, installDirectory)
            : null;
          const installedMeta = installedDir ? this.readSkillMetadataFromDir(installedDir) : {};
          const localVersion = semver.valid(installedMeta.version) || '0.0.0';
          const incomingVersion = semver.valid(metadata.version) || '0.0.0';

          if (semver.eq(localVersion, incomingVersion) && !force) {
            throw buildSkillError('版本相同,是否强制覆盖', 'VERSION_SAME');
          }

          this.uninstallSkill(installDirectory, targetPlatforms, { skipCache: true });
        }

        const installedPlatforms = [];
        for (const platformId of targetPlatforms) {
          const platform = this.platforms[platformId];
          if (!platform) {
            console.warn(`[SkillService] Unknown platform: ${platformId}`);
            continue;
          }
          const dest = path.join(platform.dir, installDirectory);
          this.ensurePlatformDir(platform.dir);
          if (fs.existsSync(dest)) {
            fs.rmSync(dest, { recursive: true, force: true });
          }
          fs.mkdirSync(dest, { recursive: true });
          if (uploadType === 'directory') {
            this.copyUploadedDirectoryFiles(uploadBaseDir, skillDir, files, dest);
          } else {
            this.copyDirRecursive(skillDir, dest);
          }
          installedPlatforms.push(platformId);
        }

        this.skillsCache = null;
        this.cacheTime = 0;

        return {
          success: true,
          directory: installDirectory,
          installedPlatforms,
          metadata: {
            name: metadata.name || directory,
            description: metadata.description || '',
            version: metadata.version || null
          }
        };
      };

      return await this.uploadLimiter(() => this.withSkillLock(installDirectory, installTask));
    } catch (err) {
      if (err instanceof Error && !err.code) {
        err.code = 'UPLOAD_FAILED';
      }
      throw err;
    } finally {
      try {
        if (uploadBaseDir && fs.existsSync(uploadBaseDir)) {
          fs.rmSync(uploadBaseDir, { recursive: true, force: true });
        }
      } catch (err) {
        // 忽略清理错误
      }
    }
  }

  /**
   * 检查技能更新
   * @param {string} repo - GitHub 仓库地址
   */
  async checkUpdate(repo) {
    const repoInfo = this.parseRepoInput(repo);
    if (!repoInfo) {
      throw buildSkillError('仓库地址格式不正确', 'INVALID_REPO_URL');
    }

    const cacheKey = `${repoInfo.owner}/${repoInfo.name}`.toLowerCase();
    const cached = this.updateCheckCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < UPDATE_CHECK_CACHE_TTL)) {
      return cached.updates;
    }

    const latestVersion = await this.getLatestRepoVersion(repoInfo, { force: true });
    if (!latestVersion) {
      return [];
    }
    const skills = await this.listSkills(true);
    const installedSkills = skills.filter(skill =>
      skill.installed && skill.repoOwner === repoInfo.owner && skill.repoName === repoInfo.name
    );

    const updates = [];
    for (const skill of installedSkills) {
      const installedPlatforms = this.getInstalledPlatforms(skill.directory);
      const sourcePlatform = installedPlatforms.length > 0 ? this.platforms[installedPlatforms[0]] : null;
      const installedDir = sourcePlatform
        ? this.resolveInstalledSkillDir(sourcePlatform, skill.directory)
        : null;
      const localMeta = installedDir ? this.readSkillMetadataFromDir(installedDir) : {};
      const localVersion = semver.valid(localMeta.version) || '0.0.0';

      if (semver.gt(latestVersion, localVersion)) {
        updates.push({
          directory: skill.directory,
          name: skill.name,
          currentVersion: localVersion,
          latestVersion,
          repoOwner: repoInfo.owner,
          repoName: repoInfo.name,
          repoBranch: skill.repoBranch || 'main',
          installedPlatforms
        });
      }
    }

    this.updateCheckCache.set(cacheKey, {
      latestVersion,
      updates,
      timestamp: Date.now()
    });
    return updates;
  }

  /**
   * 安装技能
   * @param {string} directory - 技能目录名
   * @param {object|null} repo - 仓库信息，为 null 时使用本地复制模式
   * @param {string[]} platforms - 目标平台列表
   */
  async installSkill(directory, repo, platforms = ['claude']) {
    const installedPlatforms = [];
    const skippedPlatforms = [];
    const installDirectory = this.normalizeInstallDirectory(directory) || directory;

    // 如果没有仓库信息，使用本地复制模式
    if (!repo || !repo.owner) {
      return this.copySkillToPlatforms(directory, platforms);
    }

    // 下载仓库 ZIP
    const zipUrl = `https://github.com/${repo.owner}/${repo.name}/archive/refs/heads/${repo.branch}.zip`;
    const tempDir = path.join(os.tmpdir(), `skill-${Date.now()}`);
    const zipPath = path.join(tempDir, 'repo.zip');

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      // 下载 ZIP
      await this.downloadFile(zipUrl, zipPath);

      // 解压
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempDir, true);

      // 找到解压后的目录（GitHub ZIP 会有一个根目录）
      const extractedDirs = fs.readdirSync(tempDir).filter(f =>
        fs.statSync(path.join(tempDir, f)).isDirectory()
      );

      if (extractedDirs.length === 0) {
        throw new Error('Empty archive');
      }

      const repoDir = path.join(tempDir, extractedDirs[0]);
      let sourceDir = path.join(repoDir, directory);

      if (!fs.existsSync(sourceDir)) {
        const resolved = this.findSkillDirInRepo(repoDir, directory);
        if (resolved) {
          sourceDir = resolved;
        }
      }

      if (!fs.existsSync(sourceDir)) {
        throw new Error(`Skill directory not found: ${directory}`);
      }

      // 安装到指定的平台
      for (const platformId of platforms) {
        const platform = this.platforms[platformId];
        if (!platform) {
          console.warn(`[SkillService] Unknown platform: ${platformId}`);
          continue;
        }

        const dest = path.join(platform.dir, installDirectory);

        // 已安装则跳过
        if (this.isSkillDirPresent(platform, directory)) {
          skippedPlatforms.push(platformId);
          installedPlatforms.push(platformId);
          continue;
        }

        try {
          // 确保平台目录存在
          this.ensurePlatformDir(platform.dir);

          // 复制到安装目录
          fs.mkdirSync(dest, { recursive: true });
          this.copyDirRecursive(sourceDir, dest);
          installedPlatforms.push(platformId);
        } catch (err) {
          // 安装失败，回滚已安装的平台
          console.error(`[SkillService] Install to ${platformId} failed:`, err.message);
          for (const rollbackPlatformId of installedPlatforms) {
            if (skippedPlatforms.includes(rollbackPlatformId)) continue;
            const rollbackPlatform = this.platforms[rollbackPlatformId];
            const rollbackDest = path.join(rollbackPlatform.dir, installDirectory);
            try {
              fs.rmSync(rollbackDest, { recursive: true, force: true });
            } catch (e) {
              // 忽略回滚错误
            }
          }
          throw err;
        }
      }

      // 清除缓存，让列表刷新
      this.skillsCache = null;
      this.cacheTime = 0;

      const newlyInstalled = installedPlatforms.filter(p => !skippedPlatforms.includes(p));
      const message = newlyInstalled.length > 0
        ? `Installed to ${newlyInstalled.join(', ')}`
        : 'Already installed on all selected platforms';

      return {
        success: true,
        message,
        installedPlatforms,
        skippedPlatforms
      };
    } finally {
      // 清理临时目录
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // 忽略清理错误
      }
    }
  }

  /**
   * 本地复制模式：从已安装的平台复制到其他平台
   */
  async copySkillToPlatforms(directory, targetPlatforms) {
    const installedPlatforms = [];
    const skippedPlatforms = [];
    const installDirectory = this.normalizeInstallDirectory(directory) || directory;

    // 找到已安装该技能的源平台
    let sourceDir = null;
    let sourcePlatformId = null;
    for (const [platformId, platform] of Object.entries(this.platforms)) {
      const resolvedDir = this.resolveInstalledSkillDir(platform, directory);
      if (resolvedDir) {
        sourceDir = resolvedDir;
        sourcePlatformId = platformId;
        break;
      }
    }

    if (!sourceDir) {
      throw new Error(`Skill not found locally: ${directory}`);
    }

    // 复制到目标平台
    for (const platformId of targetPlatforms) {
      const platform = this.platforms[platformId];
      if (!platform) {
        console.warn(`[SkillService] Unknown platform: ${platformId}`);
        continue;
      }

      const dest = path.join(platform.dir, installDirectory);

      // 已安装则跳过
      if (this.isSkillDirPresent(platform, directory)) {
        skippedPlatforms.push(platformId);
        installedPlatforms.push(platformId);
        continue;
      }

      try {
        // 确保平台目录存在
        this.ensurePlatformDir(platform.dir);

        // 复制到安装目录
        fs.mkdirSync(dest, { recursive: true });
        this.copyDirRecursive(sourceDir, dest);
        installedPlatforms.push(platformId);
      } catch (err) {
        // 安装失败，回滚已安装的平台
        console.error(`[SkillService] Copy to ${platformId} failed:`, err.message);
        for (const rollbackPlatformId of installedPlatforms) {
          if (skippedPlatforms.includes(rollbackPlatformId)) continue;
          const rollbackPlatform = this.platforms[rollbackPlatformId];
          const rollbackDest = path.join(rollbackPlatform.dir, installDirectory);
          try {
            fs.rmSync(rollbackDest, { recursive: true, force: true });
          } catch (e) {
            // 忽略回滚错误
          }
        }
        throw err;
      }
    }

    // 清除缓存
    this.skillsCache = null;
    this.cacheTime = 0;

    const newlyInstalled = installedPlatforms.filter(p => !skippedPlatforms.includes(p));
    const message = newlyInstalled.length > 0
      ? `Copied from ${sourcePlatformId} to ${newlyInstalled.join(', ')}`
      : 'Already installed on all selected platforms';

    return {
      success: true,
      message,
      installedPlatforms,
      skippedPlatforms
    };
  }

  /**
   * 下载文件
   */
  async downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(dest);

      const request = https.get(url, {
        headers: { 'User-Agent': 'cc-cli-skill-service' },
        timeout: 60000
      }, (response) => {
        // 处理重定向
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          this.downloadFile(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.on('error', (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * 递归复制目录
   */
  copyDirRecursive(src, dest, options = {}) {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (options.filter && !options.filter(entry, src)) {
        continue;
      }
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirRecursive(srcPath, destPath, options);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * 创建自定义技能
   */
  createCustomSkill({ name, directory, description, content, platforms = ['claude'] }) {
    const createdPlatforms = [];
    const skippedPlatforms = [];

    // 生成 SKILL.md 内容
    const skillMdContent = `---
name: "${name}"
description: "${description}"
---

${content}
`;

    for (const platformId of platforms) {
      const platform = this.platforms[platformId];
      if (!platform) {
        console.warn(`[SkillService] Unknown platform: ${platformId}`);
        continue;
      }

      const dest = path.join(platform.dir, directory);

      // 检查是否已存在
      if (fs.existsSync(dest)) {
        skippedPlatforms.push(platformId);
        continue;
      }

      try {
        // 确保平台目录存在
        this.ensurePlatformDir(platform.dir);

        // 创建目录
        fs.mkdirSync(dest, { recursive: true });

        // 写入文件
        fs.writeFileSync(path.join(dest, 'SKILL.md'), skillMdContent, 'utf-8');
        createdPlatforms.push(platformId);
      } catch (err) {
        // 创建失败，回滚已创建的平台
        console.error(`[SkillService] Create on ${platformId} failed:`, err.message);
        for (const rollbackPlatformId of createdPlatforms) {
          const rollbackPlatform = this.platforms[rollbackPlatformId];
          const rollbackDest = path.join(rollbackPlatform.dir, directory);
          try {
            fs.rmSync(rollbackDest, { recursive: true, force: true });
          } catch (e) {
            // 忽略回滚错误
          }
        }
        throw err;
      }
    }

    // 清除缓存，让列表刷新
    this.skillsCache = null;
    this.cacheTime = 0;

    if (createdPlatforms.length === 0 && skippedPlatforms.length > 0) {
      throw new Error(`技能目录 "${directory}" 在所有选中的平台上已存在`);
    }

    const message = createdPlatforms.length > 0
      ? `技能创建成功，已安装到 ${createdPlatforms.join(', ')}`
      : '技能创建成功';

    return {
      success: true,
      message,
      directory,
      createdPlatforms,
      skippedPlatforms
    };
  }

  /**
   * 卸载技能
   */
  uninstallSkill(directory, platforms = null, options = {}) {
    if (platforms && !Array.isArray(platforms)) {
      options = platforms;
      platforms = null;
    }
    const uninstalledPlatforms = [];
    const notInstalledPlatforms = [];

    // 如果没有指定平台，则从所有已安装的平台卸载
    const installedBefore = this.getInstalledPlatforms(directory);
    const targetPlatforms = platforms || installedBefore;

    const isLastUninstall = installedBefore.length > 0
      && targetPlatforms.length === installedBefore.length
      && targetPlatforms.every(p => installedBefore.includes(p));

    let cacheResult = null;
    let uninstalledAt = null;
    let reinstallExpiresAt = null;
    if (isLastUninstall && !options.skipCache) {
      uninstalledAt = new Date().toISOString();
      reinstallExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const cachedSkill = this.skillsCache?.find(s =>
        this.getDirectoryKey(s.directory) === this.getDirectoryKey(directory)
      );
      cacheResult = this.cacheSkill(directory, {
        installedPlatforms: installedBefore,
        skill: options.skill || cachedSkill,
        allowFallback: true,
        uninstalledAt,
        uninstalledPlatforms: installedBefore,
        canReinstall: true,
        reinstallExpiresAt
      });
    }

    if (targetPlatforms.length === 0) {
      return { success: true, message: 'Not installed on any platform' };
    }

    for (const platformId of targetPlatforms) {
      const platform = this.platforms[platformId];
      if (!platform) {
        console.warn(`[SkillService] Unknown platform: ${platformId}`);
        continue;
      }

      const candidates = this.getDirectoryCandidates(directory);
      let removed = false;
      for (const candidate of candidates) {
        const dest = path.join(platform.dir, candidate);
        if (!fs.existsSync(dest)) {
          continue;
        }
        try {
          fs.rmSync(dest, { recursive: true, force: true });
          removed = true;
        } catch (err) {
          console.error(`[SkillService] Uninstall from ${platformId} failed:`, err.message);
        }
      }

      if (removed) {
        uninstalledPlatforms.push(platformId);
      } else {
        notInstalledPlatforms.push(platformId);
      }
    }

    // 清除缓存
    this.skillsCache = null;
    this.cacheTime = 0;

    const message = uninstalledPlatforms.length > 0
      ? `Uninstalled from ${uninstalledPlatforms.join(', ')}`
      : 'Not installed on selected platforms';

    return {
      success: true,
      message,
      cached: Boolean(cacheResult),
      cache: cacheResult,
      uninstalledAt,
      reinstallExpiresAt,
      uninstalledPlatforms,
      notInstalledPlatforms
    };
  }

  /**
   * 获取技能详情（完整内容）
   */
  async getSkillDetail(directory) {
    // 获取已安装的平台列表
    const installedPlatforms = this.getInstalledPlatforms(directory);

    // 先检查本地是否安装（优先从第一个已安装的平台读取）
    if (installedPlatforms.length > 0) {
      const platform = this.platforms[installedPlatforms[0]];
      const resolvedDir = this.resolveInstalledSkillDir(platform, directory);
      const localPath = resolvedDir ? path.join(resolvedDir, 'SKILL.md') : null;

      if (localPath && fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath, 'utf-8');
        const metadata = this.parseSkillMd(content);

        // 提取正文内容（去除 frontmatter）
        const bodyMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
        const body = bodyMatch ? bodyMatch[1].trim() : content;

        return {
          directory,
          name: metadata.name || directory,
          description: metadata.description || '',
          content: body,
          fullContent: content,
          installed: true,
          installedPlatforms,
          source: 'local'
        };
      }
    }

    // 如果本地没有，尝试从缓存的技能列表中获取仓库信息
    const cachedMeta = this.readCacheMetadata(directory, { removeOnCorrupt: true });
    if (cachedMeta) {
      const cacheDir = this.resolveCacheDirectory(directory);
      const cacheSkillMd = path.join(cacheDir, 'SKILL.md');
      if (cachedMeta.cacheAvailable && fs.existsSync(cacheSkillMd)) {
        const content = fs.readFileSync(cacheSkillMd, 'utf-8');
        const metadata = this.parseSkillMd(content);
        const bodyMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
        const body = bodyMatch ? bodyMatch[1].trim() : content;
        const sourceType = cachedMeta.source?.type === 'repository' ? 'github' : 'local';
        return {
          directory,
          name: metadata.name || cachedMeta.metadata?.name || directory,
          description: metadata.description || cachedMeta.metadata?.description || '',
          content: body,
          fullContent: content,
          installed: false,
          installedPlatforms: [],
          source: sourceType,
          repoOwner: cachedMeta.source?.repoOwner || null,
          repoName: cachedMeta.source?.repoName || null
        };
      }

      const sourceType = cachedMeta.source?.type === 'repository' ? 'github' : 'local';
      return {
        directory,
        name: cachedMeta.metadata?.name || directory,
        description: cachedMeta.metadata?.description || '',
        content: '',
        fullContent: '',
        installed: false,
        installedPlatforms: [],
        source: sourceType,
        repoOwner: cachedMeta.source?.repoOwner || null,
        repoName: cachedMeta.source?.repoName || null
      };
    }

    const cachedSkill = this.skillsCache?.find(s => s.directory === directory);

    if (cachedSkill && cachedSkill.repoOwner && cachedSkill.repoName) {
      // 从 GitHub 获取内容
      try {
        const repo = {
          owner: cachedSkill.repoOwner,
          name: cachedSkill.repoName,
          branch: cachedSkill.repoBranch || 'main'
        };

        // 获取文件树找到 SKILL.md 的 SHA
        const treeUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/git/trees/${repo.branch}?recursive=1`;
        const tree = await this.fetchGitHubApi(treeUrl);

        const skillFile = tree.tree?.find(item =>
          item.type === 'blob' && item.path === `${directory}/SKILL.md`
        );

        if (skillFile) {
          const content = await this.fetchBlobContent(skillFile.sha, repo, skillFile.path);
          const metadata = this.parseSkillMd(content);

          const bodyMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
          const body = bodyMatch ? bodyMatch[1].trim() : content;

          return {
            directory,
            name: metadata.name || directory,
            description: metadata.description || '',
            content: body,
            fullContent: content,
            installed: false,
            installedPlatforms: [],
            source: 'github',
            repoOwner: repo.owner,
            repoName: repo.name
          };
        }
      } catch (err) {
        console.warn('[SkillService] Fetch remote skill detail error:', err.message);
      }
    }

    throw new Error('技能不存在或无法获取');
  }

  /**
   * 获取已安装技能列表
   */
  getInstalledSkills() {
    const skills = [];
    // 扫描所有平台的技能目录
    for (const [platformId, platform] of Object.entries(this.platforms)) {
      if (fs.existsSync(platform.dir)) {
        this.scanLocalDir(platform.dir, platform.dir, skills, platformId);
      }
    }
    return skills;
  }
}

module.exports = {
  SkillService,
  DEFAULT_REPOS,
  PLATFORMS,
  LRUSkillCache
};
