const fs = require('fs');
const path = require('path');
const { getAppDir } = require('../../utils/app-path-manager');

function getAliasFilePath() {
  const appDir = getAppDir();
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return path.join(appDir, 'aliases.json');
}

// Ensure alias directory exists
function ensureAliasDir() {
  const aliasDir = path.dirname(getAliasFilePath());
  if (!fs.existsSync(aliasDir)) {
    fs.mkdirSync(aliasDir, { recursive: true });
  }
}

// Load all aliases
function loadAliases() {
  ensureAliasDir();

  const aliasFile = getAliasFilePath();
  if (!fs.existsSync(aliasFile)) {
    return {};
  }

  try {
    const content = fs.readFileSync(aliasFile, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading aliases:', error);
    return {};
  }
}

// Save aliases
function saveAliases(aliases) {
  ensureAliasDir();

  try {
    fs.writeFileSync(getAliasFilePath(), JSON.stringify(aliases, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving aliases:', error);
    throw error;
  }
}

// Set alias for a session
function setAlias(sessionId, alias) {
  const aliases = loadAliases();
  aliases[sessionId] = alias;
  saveAliases(aliases);
  return aliases;
}

// Delete alias
function deleteAlias(sessionId) {
  const aliases = loadAliases();
  delete aliases[sessionId];
  saveAliases(aliases);
  return aliases;
}

// Get alias for a session
function getAlias(sessionId) {
  const aliases = loadAliases();
  return aliases[sessionId] || null;
}

module.exports = {
  loadAliases,
  setAlias,
  deleteAlias,
  getAlias
};
