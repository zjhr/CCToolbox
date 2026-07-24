const express = require('express');
const { getRequestLogs } = require('../services/request-logs-service');

const router = express.Router();
const TOOL_TYPES = new Set(['claude-code', 'codex', 'gemini']);

router.get('/', (req, res) => {
  try {
    const success = req.query.success === undefined || req.query.success === ''
      ? undefined
      : req.query.success === 'true';
    const toolType = TOOL_TYPES.has(req.query.toolType) ? req.query.toolType : undefined;
    const result = getRequestLogs({
      from: req.query.from,
      to: req.query.to,
      toolType,
      channel: typeof req.query.channel === 'string' ? req.query.channel : undefined,
      model: typeof req.query.model === 'string' ? req.query.model : undefined,
      success,
      page: req.query.page,
      pageSize: req.query.pageSize
    });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('日期') ? 400 : 500;
    if (status === 500) console.error('[Request Logs] 查询失败:', error);
    res.status(status).json({ error: error.message || '查询请求日志失败' });
  }
});

module.exports = router;
