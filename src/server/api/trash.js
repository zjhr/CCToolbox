const express = require('express');
const {
  moveToTrash,
  listTrash,
  restoreFromTrash,
  permanentDelete,
  emptyTrash,
  cleanupExpiredTrash,
  getTrashMessages
} = require('../services/trash');
const { isCodexInstalled } = require('../services/codex-config');
const { isGeminiInstalled } = require('../services/gemini-config');

const router = express.Router();

function validateChannel(channel) {
  if (!['claude', 'codex', 'gemini'].includes(channel)) {
    const error = new Error('Invalid channel');
    error.statusCode = 400;
    throw error;
  }

  if (channel === 'codex' && !isCodexInstalled()) {
    const error = new Error('Codex CLI not installed');
    error.statusCode = 404;
    throw error;
  }

  if (channel === 'gemini' && !isGeminiInstalled()) {
    const error = new Error('Gemini CLI not installed');
    error.statusCode = 404;
    throw error;
  }
}

module.exports = (config) => {
  router.post('/:channel/sessions/:project/batch-delete', async (req, res) => {
    try {
      const { channel, project } = req.params;
      validateChannel(channel);

      const { sessionIds } = req.body;
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        return res.status(400).json({ error: 'sessionIds must be a non-empty array' });
      }

      const results = [];
      for (const sessionId of sessionIds) {
        try {
          const result = await moveToTrash(config, project, sessionId, channel);
          results.push({ sessionId, trashId: result.trashId, success: true });
        } catch (err) {
          results.push({ sessionId, error: err.message, success: false });
        }
      }

      const deleted = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({
        success: failed === 0,
        deleted,
        failed,
        trashIds: results.filter(r => r.success).map(r => r.trashId),
        failures: results.filter(r => !r.success)
      });
    } catch (err) {
      console.error('[Trash API] Failed to batch delete sessions:', err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  router.get('/:channel/sessions/:project/trash', async (req, res) => {
    try {
      const { channel, project } = req.params;
      validateChannel(channel);
      await cleanupExpiredTrash();
      const data = await listTrash(project, channel);
      res.json(data);
    } catch (err) {
      console.error('[Trash API] Failed to list trash:', err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  router.post('/:channel/sessions/:project/trash/restore', async (req, res) => {
    try {
      const { channel, project } = req.params;
      validateChannel(channel);

      const { trashIds, aliasStrategy } = req.body;
      if (!Array.isArray(trashIds) || trashIds.length === 0) {
        return res.status(400).json({ error: 'trashIds must be a non-empty array' });
      }

      const result = await restoreFromTrash(config, project, trashIds, channel, { aliasStrategy });
      res.json(result);
    } catch (err) {
      console.error('[Trash API] Failed to restore sessions:', err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  router.get('/:channel/sessions/:project/trash/:trashId/messages', async (req, res) => {
    try {
      const { channel, project, trashId } = req.params;
      validateChannel(channel);
      const { page = 1, limit = 20, order = 'desc' } = req.query;
      const result = await getTrashMessages(project, trashId, channel, { page, limit, order });
      res.json(result);
    } catch (err) {
      console.error('[Trash API] Failed to get trash messages:', err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  router.delete('/:channel/sessions/:project/trash/:trashId', async (req, res) => {
    try {
      const { channel, project, trashId } = req.params;
      validateChannel(channel);

      const result = await permanentDelete(project, trashId);
      res.json(result);
    } catch (err) {
      console.error('[Trash API] Failed to delete trash item:', err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  router.delete('/:channel/sessions/:project/trash', async (req, res) => {
    try {
      const { channel, project } = req.params;
      validateChannel(channel);

      const result = await emptyTrash(project, channel);
      res.json(result);
    } catch (err) {
      console.error('[Trash API] Failed to empty trash:', err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  return router;
};
