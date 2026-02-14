const express = require('express');
const {
  getBatchDeleteManager,
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
  const batchDeleteManager = getBatchDeleteManager();

  router.post('/:channel/sessions/:project/batch-delete', async (req, res) => {
    try {
      const { channel, project } = req.params;
      validateChannel(channel);

      const { sessionIds } = req.body;
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        return res.status(400).json({ error: 'sessionIds must be a non-empty array' });
      }

      const task = batchDeleteManager.createTask({
        config,
        projectName: project,
        channel,
        sessionIds
      });

      res.status(202).json({
        taskId: task.taskId,
        totalCount: task.totalCount
      });
    } catch (err) {
      console.error('[Trash API] Failed to batch delete sessions:', err);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  router.get('/delete-progress', (req, res) => {
    const { taskId } = req.query;
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const task = batchDeleteManager.getTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const sendEvent = (eventRecord) => {
      res.write(`id: ${eventRecord.id}\n`);
      res.write(`event: ${eventRecord.event}\n`);
      res.write(`data: ${JSON.stringify(eventRecord.data)}\n\n`);
    };

    const lastEventId = req.get('Last-Event-ID') || req.query.lastEventId || null;
    const history = batchDeleteManager.getTaskEventsSince(taskId, lastEventId);
    history.forEach(sendEvent);

    if (task.status !== 'running') {
      return res.end();
    }

    const onProgress = (payload) => {
      if (payload.taskId !== taskId) return;
      const currentTask = batchDeleteManager.getTask(taskId);
      const eventRecord = currentTask?.events?.find(item => item.id === payload.eventId);
      if (eventRecord) {
        sendEvent(eventRecord);
      }
    };

    const onError = (payload) => {
      if (payload.taskId !== taskId) return;
      const currentTask = batchDeleteManager.getTask(taskId);
      const eventRecord = currentTask?.events?.find(item => item.id === payload.eventId);
      if (eventRecord) {
        sendEvent(eventRecord);
      }
    };

    const onComplete = (payload) => {
      if (payload.taskId !== taskId) return;
      const currentTask = batchDeleteManager.getTask(taskId);
      const eventRecord = currentTask?.events?.find(item => item.id === payload.eventId);
      if (eventRecord) {
        sendEvent(eventRecord);
      }
      cleanup();
      res.end();
    };

    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    const cleanup = () => {
      clearInterval(keepAlive);
      batchDeleteManager.off('progress', onProgress);
      batchDeleteManager.off('error', onError);
      batchDeleteManager.off('complete', onComplete);
    };

    batchDeleteManager.on('progress', onProgress);
    batchDeleteManager.on('error', onError);
    batchDeleteManager.on('complete', onComplete);

    req.on('close', () => {
      cleanup();
    });
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
