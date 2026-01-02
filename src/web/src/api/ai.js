import { client } from './client'

export async function getAIConfig() {
  const response = await client.get('/ai-config')
  return response.data
}

export async function saveAIConfig(config, provider) {
  const response = await client.post('/ai-config', { config, provider })
  return response.data
}

export async function testConnection(provider, config) {
  const response = await client.post('/ai-config/test', { provider, config })
  return response.data
}

export async function getPresetTags() {
  const response = await client.get('/ai-config/tags')
  return response.data
}

export async function updatePresetTags(tags) {
  const response = await client.post('/ai-config/tags', { tags })
  return response.data
}

export async function acceptPrivacy(accepted = true) {
  const response = await client.post('/ai-config/privacy-consent', { accepted })
  return response.data
}

export async function generateAlias(payload) {
  const response = await client.post('/ai-assistant/generate-alias', payload)
  return response.data
}

export async function getSessionMetadata(sessionId) {
  const response = await client.get(`/ai-assistant/metadata/${sessionId}`)
  return response.data
}

export async function setSessionMetadata(sessionId, payload) {
  const response = await client.post('/ai-assistant/metadata', { sessionId, ...payload })
  return response.data
}

export async function deleteSessionMetadata(sessionId) {
  const response = await client.delete(`/ai-assistant/metadata/${sessionId}`)
  return response.data
}

export async function getSessionSummary(projectName, sessionId) {
  const response = await client.get(`/ai-assistant/summary/${projectName}/${sessionId}`)
  return response.data
}

export async function summarizeSession(payload) {
  const response = await client.post('/ai-assistant/summarize', payload, { timeout: 120000 })
  return response.data
}
