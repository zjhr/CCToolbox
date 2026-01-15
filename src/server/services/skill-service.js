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
const { getAppDir } = require('../../utils/app-path-manager');

// 默认仓库源 - 只预设官方仓库，其他由用户手动添加
const DEFAULT_REPOS = [
  { owner: 'anthropics', name: 'skills', branch: 'main', enabled: true }
];

// 缓存有效期（5分钟）
const CACHE_TTL = 5 * 60 * 1000;

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

    // 多平台配置
    this.platforms = PLATFORMS;

    // 内存缓存
    this.skillsCache = null;
    this.cacheTime = 0;

    // 确保目录存在
    this.ensureDirs();
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
    return repos;
  }

  /**
   * 删除仓库
   */
  removeRepo(owner, name) {
    const repos = this.loadRepos();
    const filtered = repos.filter(r => !(r.owner === owner && r.name === name));
    this.saveRepos(filtered);
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
    }
    return repos;
  }

  /**
   * 获取所有技能列表（带缓存）
   */
  async listSkills(forceRefresh = false) {
    // 强制刷新时清除缓存
    if (forceRefresh) {
      this.skillsCache = null;
      this.cacheTime = 0;
      // 删除文件缓存
      try {
        if (fs.existsSync(this.cachePath)) {
          fs.unlinkSync(this.cachePath);
        }
      } catch (err) {
        console.warn('[SkillService] Failed to delete cache file:', err.message);
      }
    }

    // 检查内存缓存
    if (!forceRefresh && this.skillsCache && (Date.now() - this.cacheTime < CACHE_TTL)) {
      this.updateInstallStatus(this.skillsCache);
      return this.skillsCache;
    }

    // 检查文件缓存
    if (!forceRefresh) {
      const fileCache = this.loadCacheFromFile();
      if (fileCache) {
        this.skillsCache = fileCache;
        this.cacheTime = Date.now();
        this.updateInstallStatus(this.skillsCache);
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
        const repoInfo = `${enabledRepos[i].owner}/${enabledRepos[i].name}`;
        if (result.status === 'fulfilled') {
          skills.push(...result.value);
        } else {
          console.warn(`[SkillService] Fetch repo ${repoInfo} failed:`, result.reason?.message);
        }
      }
    }

    // 合并本地已安装的技能
    this.mergeLocalSkills(skills);

    // 去重并排序
    this.deduplicateSkills(skills);
    skills.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

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
   * 更新技能的安装状态
   */
  updateInstallStatus(skills) {
    for (const skill of skills) {
      // 获取已安装的平台列表
      skill.installedPlatforms = this.getInstalledPlatforms(skill.directory);
      skill.installed = skill.installedPlatforms.length > 0;
    }
  }

  /**
   * 从 GitHub 仓库获取技能列表（使用 Tree API 一次性获取）
   */
  async fetchRepoSkills(repo) {
    const skills = [];

    try {
      // 使用 GitHub Tree API 一次性获取所有文件
      const treeUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/git/trees/${repo.branch}?recursive=1`;
      const tree = await this.fetchGitHubApi(treeUrl);

      if (!tree || !tree.tree) {
        console.warn(`[SkillService] Empty tree for ${repo.owner}/${repo.name}`);
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
          batch.map(file => this.fetchAndParseSkill(file, repo))
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            skills.push(result.value);
          }
        }
      }
    } catch (err) {
      console.error(`[SkillService] Fetch repo ${repo.owner}/${repo.name} error:`, err.message);
      throw err;
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
      const sourceDir = path.join(repoDir, directory);

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
  copyDirRecursive(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirRecursive(srcPath, destPath);
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
  uninstallSkill(directory, platforms = null) {
    const uninstalledPlatforms = [];
    const notInstalledPlatforms = [];

    // 如果没有指定平台，则从所有已安装的平台卸载
    const targetPlatforms = platforms || this.getInstalledPlatforms(directory);

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
  PLATFORMS
};
