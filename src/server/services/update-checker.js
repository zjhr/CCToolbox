const path = require('path');
const { checkGitUpdate } = require('../../utils/git-version');
const { broadcastUpdate } = require('../websocket-server');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const projectRoot = path.resolve(__dirname, '../../..');

let timer = null;
let isRunning = false;

async function performCheck() {
  try {
    const result = await checkGitUpdate(projectRoot);
    if (result.type !== 'git' || !result.hasUpdate) {
      return result;
    }

    broadcastUpdate({
      type: 'update-available',
      updateType: 'git',
      current: result.current,
      remote: result.latest,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    // 检查失败时保持静默，避免影响主流程
    return {
      type: 'git',
      hasUpdate: false,
      error: true,
      reason: error.message
    };
  }
}

function startUpdateChecker() {
  if (timer) return;
  isRunning = true;

  performCheck();
  timer = setInterval(() => {
    performCheck();
  }, CHECK_INTERVAL_MS);
}

function stopUpdateChecker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  isRunning = false;
}

function isUpdateCheckerRunning() {
  return isRunning;
}

module.exports = {
  startUpdateChecker,
  stopUpdateChecker,
  performCheck,
  isUpdateCheckerRunning
};
