const express = require('express');
const router = express.Router();
const { searchSessionsAcrossProjects } = require('../services/sessions');

module.exports = (config) => {
  /**
   * GET /api/search/sessions
   * 跨项目搜索会话内容
   */
  router.get('/sessions', (req, res) => {
    try {
      const { keyword, context } = req.query;

      if (!keyword) {
        return res.status(400).json({ error: 'Keyword is required' });
      }

      const contextLength = context ? parseInt(context) : 35;
      const results = searchSessionsAcrossProjects(config, keyword, contextLength);

      res.json({
        keyword,
        totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
        sessions: results
      });
    } catch (error) {
      console.error('[Search API] Error searching sessions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
