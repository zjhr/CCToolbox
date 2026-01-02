const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const {
  checkHealth,
  getOverview,
  listMemories,
  readMemory,
  writeMemory,
  deleteMemory,
  batchDeleteMemories,
  getSettings,
  saveSettings,
  getCacheStatus,
  getFiles,
  getSymbols,
  getSymbolReferences
} = require('../services/serena.service');

function resolveProjectPath(req) {
  return req.query.projectPath || req.body?.projectPath || '';
}

function requireProjectPath(req, res) {
  const projectPath = resolveProjectPath(req);
  if (!projectPath) {
    res.status(400).json({ success: false, error: { code: 'MISSING_PROJECT_PATH', message: '缺少 projectPath' } });
    return null;
  }
  if (!path.isAbsolute(projectPath)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_PROJECT_PATH', message: 'projectPath 必须为绝对路径' } });
    return null;
  }
  if (!fs.existsSync(projectPath)) {
    res.status(404).json({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目路径不存在' } });
    return null;
  }
  return projectPath;
}

function handleError(res, err) {
  const status = err.statusCode || 500;
  const code = err.code || 'SERENA_ERROR';
  res.status(status).json({ success: false, error: { code, message: err.message } });
}

// GET /api/serena/health
router.get('/health', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = checkHealth(projectPath);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/serena/overview
router.get('/overview', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = getOverview(projectPath);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/serena/memories
router.get('/memories', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const query = req.query.query || '';
    const items = listMemories(projectPath, { query });
    res.json({ success: true, data: { items } });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/serena/memories/:name
router.get('/memories/:name', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = readMemory(projectPath, req.params.name);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/serena/memories/:name
router.post('/memories/:name', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const content = req.body?.content || '';
    const data = writeMemory(projectPath, req.params.name, content);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// DELETE /api/serena/memories/:name
router.delete('/memories/:name', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = deleteMemory(projectPath, req.params.name);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/serena/memories/batch-delete
router.post('/memories/batch-delete', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  const names = Array.isArray(req.body?.names) ? req.body.names : [];
  try {
    const data = batchDeleteMemories(projectPath, names);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/serena/files
router.get('/files', async (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = await getFiles(projectPath);
    res.json({ success: true, data: { tree: data } });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/serena/cache/status
router.get('/cache/status', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = getCacheStatus(projectPath);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/serena/symbols
router.get('/symbols', async (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = await getSymbols(projectPath, {
      filePath: req.query.filePath || '',
      query: req.query.query || ''
    });
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/serena/symbols/references
router.get('/symbols/references', async (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = await getSymbolReferences(projectPath, req.query.symbol || '');
    res.json({ success: true, data: { items: data } });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/serena/settings
router.get('/settings', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = getSettings(projectPath);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/serena/settings
router.post('/settings', (req, res) => {
  const projectPath = requireProjectPath(req, res);
  if (!projectPath) return;

  try {
    const data = saveSettings(projectPath, req.body?.settings || {});
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = () => router;
