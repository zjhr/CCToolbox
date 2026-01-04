const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { checkGitUpdate, isGitRepository } = require('../../utils/git-version');
const { getCurrentVersion } = require('../../utils/version-check');
const { broadcastUpdate } = require('../websocket-server');

const router = express.Router();
const projectRoot = path.resolve(__dirname, '../../..');

const UPDATE_STEPS = [
  '检查本地修改',
  '拉取最新代码',
  '安装依赖',
  '构建前端资源',
  '重启服务',
  '健康检查'
];

let currentProcess = null;

function buildSteps() {
  return UPDATE_STEPS.map((title) => ({
    title,
    status: 'pending'
  }));
}

function emitProgress(state) {
  broadcastUpdate({
    type: 'update-progress',
    step: state.step,
    total: state.total,
    message: state.message,
    progress: state.progress,
    output: state.output || '',
    steps: state.steps,
    timestamp: Date.now()
  });
}

async function performCheck() {
  return checkGitUpdate(projectRoot);
}

router.get('/check', async (_req, res) => {
  try {
    const result = await performCheck();
    if (result.type === 'git' && result.hasUpdate) {
      broadcastUpdate({
        type: 'update-available',
        updateType: 'git',
        current: result.current,
        remote: result.latest,
        timestamp: Date.now()
      });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

router.post('/execute', async (_req, res) => {
  if (currentProcess) {
    return res.status(409).json({
      success: false,
      message: '更新正在进行中，请稍后再试'
    });
  }

  const isRepo = await isGitRepository(projectRoot);
  if (!isRepo) {
    return res.status(400).json({
      success: false,
      error: 'Not a git repository',
      message: '请使用: npm install -g cctoolbox@latest'
    });
  }

  const steps = buildSteps();
  const state = {
    step: 0,
    total: steps.length,
    message: '准备更新...',
    progress: 0,
    output: '',
    steps
  };

  emitProgress(state);

  const child = spawn('python3', ['update.py'], {
    cwd: projectRoot,
    shell: false
  });
  currentProcess = child;

  let buffer = '';
  let outputLines = [];
  const stepPattern = /^\[(\d+)\/(\d+)\]\s*(.+)$/;

  function handleLine(line) {
    if (!line) return;
    outputLines.push(line);

    const match = line.match(stepPattern);
    if (match) {
      const stepIndex = Math.max(parseInt(match[1], 10) - 1, 0);
      state.step = stepIndex + 1;
      state.total = Math.max(parseInt(match[2], 10), steps.length);
      state.message = match[3];

      state.steps = steps.map((step, index) => {
        if (index < stepIndex) {
          return { ...step, status: 'completed' };
        }
        if (index === stepIndex) {
          return { ...step, status: 'in_progress' };
        }
        return { ...step, status: 'pending' };
      });

      state.progress = Math.min(Math.round((state.step / state.total) * 100), 100);
      state.output = '';
      emitProgress(state);
      return;
    }

    state.output = line;
    emitProgress(state);
  }

  child.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    lines.forEach(handleLine);
  });

  child.stderr.on('data', (data) => {
    outputLines.push(data.toString());
  });

  child.on('error', (error) => {
    currentProcess = null;
    broadcastUpdate({
      type: 'update-error',
      success: false,
      message: '更新启动失败',
      error: error.message,
      rollback: false,
      timestamp: Date.now()
    });
  });

  child.on('close', (code) => {
    currentProcess = null;

    if (code === 0) {
      const latestVersion = getCurrentVersion();
      const finalSteps = steps.map((step) => ({
        ...step,
        status: 'completed'
      }));
      emitProgress({
        ...state,
        step: steps.length,
        total: steps.length,
        message: '更新完成',
        progress: 100,
        steps: finalSteps
      });
      broadcastUpdate({
        type: 'update-complete',
        success: true,
        message: '更新完成，页面即将刷新',
        newVersion: latestVersion,
        timestamp: Date.now()
      });
      return;
    }

    const errorMessage = outputLines.slice(-10).join('\n') || `更新失败，退出码 ${code}`;
    const failedSteps = steps.map((step, index) => {
      if (index < state.step - 1) {
        return { ...step, status: 'completed' };
      }
      if (index === state.step - 1) {
        return { ...step, status: 'failed' };
      }
      return { ...step, status: 'pending' };
    });

    emitProgress({
      ...state,
      message: '更新失败',
      progress: state.progress,
      steps: failedSteps
    });

    broadcastUpdate({
      type: 'update-error',
      success: false,
      message: '更新失败，请查看日志',
      error: errorMessage,
      rollback: true,
      timestamp: Date.now()
    });
  });

  res.json({
    success: true,
    message: 'Update started'
  });
});

module.exports = router;
