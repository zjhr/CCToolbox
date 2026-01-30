/**
 * Skills API 路由
 */

const express = require('express');
const { skillServiceSingleton } = require('../services/skill-service');
const { skillUploadMiddleware } = require('../middleware/upload');

const router = express.Router();
const skillService = skillServiceSingleton;

function sendSkillError(res, err, status = 500) {
  const code = err.code || 'SKILL_ERROR';
  const payload = {
    success: false,
    message: err.message,
    error: err.message,
    code,
    fallbackAvailable: Boolean(err.fallbackAvailable)
  };

  if (payload.fallbackAvailable || err.code) {
    return res.json(payload);
  }

  return res.status(status).json(payload);
}

/**
 * 获取技能列表
 * GET /api/skills
 * Query: refresh=1 强制刷新缓存
 */
router.get('/', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const skills = await skillService.listSkills(forceRefresh);
    res.json({
      success: true,
      skills,
      total: skills.length,
      installed: skills.filter(s => s.installed).length,
      warnings: skillService.getLastRepoWarnings()
    });
  } catch (err) {
    console.error('[Skills API] List skills error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 获取技能详情（完整内容）
 * GET /api/skills/detail/:directory
 */
router.get('/detail/*', async (req, res) => {
  try {
    const directory = req.params[0]; // 获取通配符匹配的路径
    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    const result = await skillService.getSkillDetail(directory);
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Get skill detail error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 获取已安装的技能
 * GET /api/skills/installed
 */
router.get('/installed', (req, res) => {
  try {
    const skills = skillService.getInstalledSkills();
    res.json({
      success: true,
      skills
    });
  } catch (err) {
    console.error('[Skills API] Get installed skills error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 获取平台列表
 * GET /api/skills/platforms
 */
router.get('/platforms', (req, res) => {
  try {
    const platforms = skillService.getPlatforms();
    res.json({
      success: true,
      platforms
    });
  } catch (err) {
    console.error('[Skills API] Get platforms error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 安装技能
 * POST /api/skills/install
 * Body: { directory, repo: { owner, name, branch }, platforms?: string[] }
 */
router.post('/install', async (req, res) => {
  try {
    const { directory, repo, platforms } = req.body;

    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    // 验证 platforms 参数
    const targetPlatforms = platforms || ['claude'];
    if (!Array.isArray(targetPlatforms) || targetPlatforms.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'platforms must be a non-empty array'
      });
    }

    // repo 可以为 null（本地复制模式）
    const repoInfo = (repo && repo.owner && repo.name) ? {
      owner: repo.owner,
      name: repo.name,
      branch: repo.branch || 'main'
    } : null;

    const result = await skillService.installSkill(directory, repoInfo, targetPlatforms);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Install skill error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 创建自定义技能
 * POST /api/skills/create
 * Body: { name, directory, description, content, platforms?: string[] }
 */
router.post('/create', (req, res) => {
  try {
    const { name, directory, description, content, platforms } = req.body;

    if (!directory) {
      return res.status(400).json({
        success: false,
        message: '请输入目录名称'
      });
    }

    // 校验目录名：只允许英文、数字、横杠、下划线
    if (!/^[a-zA-Z0-9_-]+$/.test(directory)) {
      return res.status(400).json({
        success: false,
        message: '目录名只能包含英文、数字、横杠和下划线'
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        message: '请输入技能内容'
      });
    }

    // 验证 platforms 参数
    const targetPlatforms = platforms || ['claude'];
    if (!Array.isArray(targetPlatforms) || targetPlatforms.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'platforms must be a non-empty array'
      });
    }

    const result = skillService.createCustomSkill({
      name: name || directory,
      directory,
      description: description || '',
      content,
      platforms: targetPlatforms
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Create skill error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 上传技能
 * POST /api/skills/upload
 */
router.post('/upload', skillUploadMiddleware, async (req, res) => {
  try {
    const force = String(req.body?.force || '').toLowerCase() === 'true';
    const result = await skillService.uploadSkill(req.uploadedFiles, {
      force,
      uploadType: req.uploadType,
      uploadBaseDir: req.uploadBaseDir
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Upload skill error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 卸载技能
 * POST /api/skills/uninstall
 * Body: { directory, platforms?: string[] }
 */
router.post('/uninstall', (req, res) => {
  try {
    const { directory, platforms, skipCache } = req.body;

    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    // platforms 为 null 时从所有已安装的平台卸载
    const targetPlatforms = platforms || null;
    if (targetPlatforms !== null && (!Array.isArray(targetPlatforms) || targetPlatforms.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'platforms must be a non-empty array or null'
      });
    }

    const result = skillService.uninstallSkill(directory, targetPlatforms, {
      skipCache: Boolean(skipCache)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Uninstall skill error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 检查技能更新
 * POST /api/skills/check-update
 * Body: { repo }
 */
router.post('/check-update', async (req, res) => {
  try {
    const { repo } = req.body;
    if (!repo) {
      return res.status(400).json({
        success: false,
        message: 'Missing repo'
      });
    }

    const updates = await skillService.checkUpdate(repo);
    res.json({
      success: true,
      data: updates
    });
  } catch (err) {
    console.error('[Skills API] Check update error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 设置技能更新源
 * POST /api/skills/update-source
 * Body: { directory, repo }
 */
router.post('/update-source', async (req, res) => {
  try {
    const { directory, repo } = req.body;
    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    const result = await skillService.setSkillUpdateSource(directory, repo);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('[Skills API] Update source error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 手动更新技能
 * POST /api/skills/update
 * Body: { directory }
 */
router.post('/update', async (req, res) => {
  try {
    const { directory } = req.body;
    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    const result = await skillService.updateSkillFromSource(directory);
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Update skill error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 禁用技能
 * POST /api/skills/disable
 * Body: { directory, skipCache?: boolean }
 */
router.post('/disable', (req, res) => {
  try {
    const { directory, skipCache } = req.body;

    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    const result = skillService.disableSkill(directory, { skipCache: Boolean(skipCache) });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Disable skill error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 启用技能
 * POST /api/skills/enable
 * Body: { directory }
 */
router.post('/enable', (req, res) => {
  try {
    const { directory } = req.body;

    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    const result = skillService.enableSkill(directory);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Enable skill error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 重新安装技能
 * POST /api/skills/reinstall
 * Body: { directory }
 */
router.post('/reinstall', async (req, res) => {
  try {
    const { directory } = req.body;
    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    const result = await skillService.reinstallSkill(directory);
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Reinstall skill error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 获取缓存技能列表
 * GET /api/skills/cached
 */
router.get('/cached', (req, res) => {
  try {
    const cached = skillService.listCached();
    res.json({
      success: true,
      data: cached,
      total: cached.length
    });
  } catch (err) {
    console.error('[Skills API] List cached skills error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 删除缓存技能
 * DELETE /api/skills/cached/:directory
 */
router.delete('/cached/*', (req, res) => {
  try {
    const directory = req.params[0];
    if (!directory) {
      return res.status(400).json({
        success: false,
        message: 'Missing directory'
      });
    }

    const result = skillService.deleteCachedSkill(directory);
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[Skills API] Delete cached skill error:', err);
    sendSkillError(res, err);
  }
});

/**
 * 获取仓库列表
 * GET /api/skills/repos
 */
router.get('/repos', (req, res) => {
  try {
    const repos = skillService.loadRepos();
    res.json({
      success: true,
      repos
    });
  } catch (err) {
    console.error('[Skills API] Get repos error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 添加仓库
 * POST /api/skills/repos
 * Body: { owner, name, branch, enabled }
 */
router.post('/repos', (req, res) => {
  try {
    const { owner, name, branch = 'main', enabled = true } = req.body;

    if (!owner || !name) {
      return res.status(400).json({
        success: false,
        message: 'Missing owner or name'
      });
    }

    const repos = skillService.addRepo({ owner, name, branch, enabled });

    res.json({
      success: true,
      repos
    });
  } catch (err) {
    console.error('[Skills API] Add repo error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 删除仓库
 * DELETE /api/skills/repos/:owner/:name
 */
router.delete('/repos/:owner/:name', (req, res) => {
  try {
    const { owner, name } = req.params;
    const repos = skillService.removeRepo(owner, name);

    res.json({
      success: true,
      repos
    });
  } catch (err) {
    console.error('[Skills API] Remove repo error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/**
 * 切换仓库启用状态
 * PUT /api/skills/repos/:owner/:name/toggle
 * Body: { enabled }
 */
router.put('/repos/:owner/:name/toggle', (req, res) => {
  try {
    const { owner, name } = req.params;
    const { enabled } = req.body;

    const repos = skillService.toggleRepo(owner, name, enabled);

    res.json({
      success: true,
      repos
    });
  } catch (err) {
    console.error('[Skills API] Toggle repo error:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;
