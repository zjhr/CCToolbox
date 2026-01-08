function normalizeEnvKey(envKey) {
  if (!envKey || typeof envKey !== 'string') {
    return envKey;
  }

  let normalized = envKey.trim().toUpperCase();
  normalized = normalized.replace(/[^A-Z0-9_]/g, '_');
  normalized = normalized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');

  if (!normalized) {
    normalized = 'PROVIDER';
  }

  if (/^[0-9]/.test(normalized)) {
    normalized = `PROVIDER_${normalized}`;
  }

  return normalized;
}

function buildEnvKeyFromProvider(providerKey) {
  if (!providerKey || typeof providerKey !== 'string') {
    return '';
  }

  const base = normalizeEnvKey(providerKey);
  if (!base) {
    return 'PROVIDER_API_KEY';
  }

  if (base.endsWith('_API_KEY')) {
    return base;
  }

  return `${base}_API_KEY`;
}

module.exports = {
  normalizeEnvKey,
  buildEnvKeyFromProvider
};
