const fs = require('fs');
const path = require('path');

function getSummaryFilePath(sessionFile, sessionId) {
  if (!sessionFile || !sessionId) return null;
  const dir = path.dirname(sessionFile);
  return path.join(dir, `${sessionId}.meta.json`);
}

function loadSummary(sessionFile, sessionId) {
  const filePath = getSummaryFilePath(sessionFile, sessionId);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading session summary:', error);
    return null;
  }
}

function saveSummary(sessionFile, sessionId, summary, modelUsed) {
  if (!sessionFile || !sessionId) {
    throw new Error('sessionFile and sessionId are required');
  }
  const filePath = getSummaryFilePath(sessionFile, sessionId);
  if (!filePath) {
    throw new Error('无法解析总结文件路径');
  }
  const payload = {
    sessionId,
    summary,
    generatedAt: new Date().toISOString(),
    modelUsed: modelUsed || null
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

module.exports = {
  loadSummary,
  saveSummary
};
