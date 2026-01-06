const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const {
  computeDashboard,
  readProjectFiles,
  buildTree,
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
} = require('../services/openspec.service');
const { openspecFileGuard } = require('../middleware/openspec.fileGuard');

function resolveProjectPath(req) {
  return req.query.projectPath || req.body?.projectPath || '';
}

function requireProjectPath(req, res) {
  const projectPath = resolveProjectPath(req);
  if (!projectPath) {
    res.status(400).json({ error: '缺少 projectPath' });
    return null;
  }
  if (!path.isAbsolute(projectPath)) {
    res.status(400).json({ error: 'projectPath 必须为绝对路径' });
    return null;
  }
  if (!fs.existsSync(projectPath)) {
    res.status(404).json({ error: '项目路径不存在' });
    return null;
  }
  ensureWatcher(projectPath);
  return projectPath;
}

// GET /api/openspec/dashboard
router.get('/dashboard', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = computeDashboard(projectPath);
    res.json(data);
  } catch (err) {
    console.error('[OpenSpec] dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/openspec/projects
router.get('/projects', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const items = readProjectFiles(projectPath);
    res.json({ items });
  } catch (err) {
    console.error('[OpenSpec] projects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/openspec/specs
router.get('/specs', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const baseDir = path.resolve(projectPath, 'openspec');
    const tree = buildTree(baseDir, 'specs');
    res.json({ tree });
  } catch (err) {
    console.error('[OpenSpec] specs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/openspec/changes
router.get('/changes', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const baseDir = path.resolve(projectPath, 'openspec');
    const tree = buildTree(baseDir, 'changes');
    res.json({ tree });
  } catch (err) {
    console.error('[OpenSpec] changes error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/openspec/archives
router.get('/archives', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const baseDir = path.resolve(projectPath, 'openspec');
    const tree = buildTree(baseDir, path.join('changes', 'archive'));
    res.json({ tree });
  } catch (err) {
    console.error('[OpenSpec] archives error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/openspec/changes/delete
router.post('/changes/delete', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const result = deleteChange(projectPath, req.body?.path);
    res.json(result);
  } catch (err) {
    console.error('[OpenSpec] delete change error:', err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/openspec/settings
router.get('/settings', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const settings = readSettings(projectPath);
    res.json(settings);
  } catch (err) {
    console.error('[OpenSpec] settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/openspec/settings
router.post('/settings', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const settings = saveSettings(projectPath, req.body?.settings || {});
    res.json(settings);
  } catch (err) {
    console.error('[OpenSpec] settings save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/openspec/cli
router.get('/cli', (_req, res) => {
  try {
    const info = getCliInfo();
    res.json(info);
  } catch (err) {
    console.error('[OpenSpec] cli info error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/openspec/tools
router.get('/tools', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const items = getSupportedTools(projectPath);
    res.json({ items });
  } catch (err) {
    console.error('[OpenSpec] tools error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/openspec/tools/init
router.post('/tools/init', async (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  const tools = Array.isArray(req.body?.tools) ? req.body.tools : [];
  try {
    const result = await initTools(projectPath, tools);
    res.json(result);
  } catch (err) {
    console.error('[OpenSpec] tools init error:', err);
    res.status(err.statusCode || 500).json({
      error: err.message,
      stdout: err.stdout,
      stderr: err.stderr
    });
  }
});

// GET /api/openspec/files/read
router.get('/files/read', openspecFileGuard, (req, res) => {
  try {
    ensureWatcher(req.openspec.projectPath);
    const data = readFile(req.openspec.projectPath, req.openspec.relativePath);
    res.json(data);
  } catch (err) {
    console.error('[OpenSpec] read file error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/openspec/files/write
router.post('/files/write', openspecFileGuard, (req, res) => {
  try {
    ensureWatcher(req.openspec.projectPath);
    const { content, etag } = req.body || {};
    if (typeof content !== 'string') {
      return res.status(400).json({ error: '缺少内容' });
    }
    const result = writeFile(req.openspec.projectPath, req.openspec.relativePath, content, etag);
    if (result.conflict) {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[OpenSpec] write file error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/openspec/files/diff
router.get('/files/diff', openspecFileGuard, (req, res) => {
  try {
    ensureWatcher(req.openspec.projectPath);
    const diff = getDiff(req.openspec.projectPath, req.openspec.relativePath);
    res.json({ diff });
  } catch (err) {
    console.error('[OpenSpec] diff error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/openspec/files/resolve
router.post('/files/resolve', openspecFileGuard, (req, res) => {
  try {
    ensureWatcher(req.openspec.projectPath);
    const { resolution, content } = req.body || {};
    if (!['local', 'remote', 'merge'].includes(resolution)) {
      return res.status(400).json({ error: 'resolution 不合法' });
    }
    const result = resolveConflict(req.openspec.projectPath, req.openspec.relativePath, resolution, content);
    res.json(result);
  } catch (err) {
    console.error('[OpenSpec] resolve error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = () => router;
