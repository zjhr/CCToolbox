const fs = require('fs');
const path = require('path');
const { getAppDir } = require('../../utils/app-path-manager');
const { getAlias, setAlias, deleteAlias } = require('./alias');

const METADATA_FILE_NAME = 'session-metadata.json';
const MAX_TAG_COUNT = 4;

function ensureMetadataDir() {
  const appDir = getAppDir();
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  return appDir;
}

function getMetadataFilePath() {
  const appDir = ensureMetadataDir();
  return path.join(appDir, METADATA_FILE_NAME);
}

function loadAllMetadata() {
  const filePath = getMetadataFilePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading session metadata:', error);
    return {};
  }
}

function saveAllMetadata(data) {
  const filePath = getMetadataFilePath();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map(tag => String(tag || '').trim())
    .filter(Boolean);
}

function getAllMetadata() {
  return loadAllMetadata();
}

function getMetadata(sessionId) {
  if (!sessionId) return null;
  const allMetadata = loadAllMetadata();
  const metadata = allMetadata[sessionId] || null;
  if (metadata) {
    return metadata;
  }
  const alias = getAlias(sessionId);
  if (alias) {
    return {
      title: alias,
      tags: [],
      updatedAt: null
    };
  }
  return null;
}

function setMetadata(sessionId, payload = {}) {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  const allMetadata = loadAllMetadata();
  const title = String(payload.title || '').trim();
  let warning = null;
  let tags = normalizeTags(payload.tags);
  if (tags.length > MAX_TAG_COUNT) {
    tags = tags.slice(0, MAX_TAG_COUNT);
    warning = `标签最多 ${MAX_TAG_COUNT} 个，已自动截断`;
  }
  if (!title && tags.length === 0) {
    delete allMetadata[sessionId];
    saveAllMetadata(allMetadata);
    deleteAlias(sessionId);
    return { metadata: null, warning };
  }
  const metadata = {
    title,
    tags,
    updatedAt: new Date().toISOString()
  };
  allMetadata[sessionId] = metadata;
  saveAllMetadata(allMetadata);

  if (title) {
    setAlias(sessionId, title);
  } else {
    deleteAlias(sessionId);
  }

  return { metadata, warning };
}

module.exports = {
  getAllMetadata,
  getMetadata,
  setMetadata
};
