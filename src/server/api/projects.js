const express = require('express');
const router = express.Router();
const { getProjectsWithStats, saveProjectOrder, deleteProject } = require('../services/sessions');

module.exports = (config) => {
  // GET /api/projects - Get all projects with stats
  router.get('/', (req, res) => {
    try {
      const force = req.query.force === 'true';
      const projects = getProjectsWithStats(config, { force });

      res.json({
        projects,
        currentProject: config.currentProject || (projects[0] ? projects[0].name : null)
      });
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/projects/order - Save project order
  router.post('/order', (req, res) => {
    try {
      const { order } = req.body;
      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'Order must be an array' });
      }
      saveProjectOrder(config, order);
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving project order:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/projects/:projectName - Delete a project
  router.delete('/:projectName', (req, res) => {
    try {
      const { projectName } = req.params;
      deleteProject(config, projectName);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting project:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
