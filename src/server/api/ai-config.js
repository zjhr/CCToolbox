const express = require('express');
const router = express.Router();
const {
  loadAIConfig,
  saveAIConfig,
  updatePresetTags,
  setPrivacyAccepted,
  getProviderConfig
} = require('../services/ai-config');
const { getAIServiceManager } = require('../services/ai-service');
const { normalizeAIError } = require('../services/ai-errors');

function isMaskedValue(value) {
  return typeof value === 'string' && value.length >= 4 && /^[*]+$/.test(value);
}

function buildProviderConfigFromRequest(config, providerKey) {
  const providerConfig = config?.providers?.[providerKey];
  if (!providerConfig) {
    return null;
  }
  return {
    ...providerConfig
  };
}

function resolveTestConfig(providerKey, requestConfig) {
  const fromRequest = buildProviderConfigFromRequest(requestConfig, providerKey);
  if (!fromRequest) {
    return getProviderConfig(providerKey, { includeSecrets: true });
  }
  if (isMaskedValue(fromRequest.apiKey)) {
    const stored = getProviderConfig(providerKey, { includeSecrets: true });
    return {
      ...fromRequest,
      apiKey: stored?.apiKey || ''
    };
  }
  return fromRequest;
}

router.get('/', (req, res) => {
  try {
    const config = loadAIConfig();
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error getting AI config:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  const { config, provider } = req.body || {};
  if (!config) {
    return res.status(400).json({ error: 'Missing config' });
  }
  const providerKey = provider || config.defaultProvider;
  let testWarning = null;
  if (providerKey) {
    try {
      const aiService = getAIServiceManager();
      const providerConfig = resolveTestConfig(providerKey, config);
      await aiService.testConnection(providerKey, providerConfig);
    } catch (error) {
      const normalized = normalizeAIError(error);
      testWarning = {
        message: normalized.message,
        code: normalized.code
      };
    }
  }
  try {
    const savedConfig = saveAIConfig(config);
    res.json({ success: true, config: savedConfig, warning: testWarning });
  } catch (error) {
    console.error('Error saving AI config:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/test', async (req, res) => {
  const { provider, config } = req.body || {};
  if (!provider) {
    return res.status(400).json({ error: 'Missing provider' });
  }
  try {
    const aiService = getAIServiceManager();
    const providerConfig = resolveTestConfig(provider, config);
    const result = await aiService.testConnection(provider, providerConfig);
    res.json({ success: true, result });
  } catch (error) {
    const normalized = normalizeAIError(error);
    res.status(normalized.status || 500).json({
      error: normalized.message,
      code: normalized.code
    });
  }
});

router.get('/tags', (req, res) => {
  try {
    const config = loadAIConfig();
    res.json({ success: true, tags: config.presetTags || [] });
  } catch (error) {
    console.error('Error getting AI tags:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/tags', (req, res) => {
  const { tags } = req.body || {};
  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: 'Tags must be an array' });
  }
  try {
    const updated = updatePresetTags(tags);
    res.json({ success: true, tags: updated });
  } catch (error) {
    console.error('Error updating AI tags:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/privacy-consent', (req, res) => {
  const { accepted } = req.body || {};
  try {
    const status = setPrivacyAccepted(accepted !== false);
    res.json({ success: true, accepted: status });
  } catch (error) {
    console.error('Error updating AI privacy consent:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
