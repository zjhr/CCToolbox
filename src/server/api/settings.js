const express = require('express');
const router = express.Router();
const { detectAvailableTerminals } = require('../services/terminal-detector');

// GET /api/settings/terminals - 获取可用终端列表
router.get('/terminals', (req, res) => {
  try {
    const availableTerminals = detectAvailableTerminals();

    res.json({
      available: availableTerminals
    });
  } catch (error) {
    console.error('Error getting terminals:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
