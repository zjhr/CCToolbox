const express = require('express');
const router = express.Router();
const { getCurrentVersion } = require('../../utils/version-check');

// 健康检查接口
router.get('/', (_req, res) => {
  try {
    res.json({
      status: 'ok',
      version: getCurrentVersion(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;
