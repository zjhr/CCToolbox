import { client } from './client'

function withProjectPath(params, projectPath) {
  return {
    ...params,
    projectPath
  }
}

export async function getHealth(projectPath) {
  const response = await client.get('/serena/health', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getOverview(projectPath) {
  const response = await client.get('/serena/overview', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getMemories(projectPath, options = {}) {
  const response = await client.get('/serena/memories', {
    params: withProjectPath({
      query: options.query || ''
    }, projectPath)
  })
  return response.data
}

export async function readMemory(projectPath, name) {
  const response = await client.get(`/serena/memories/${name}`, {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function writeMemory(projectPath, name, content) {
  const response = await client.post(`/serena/memories/${name}`, {
    projectPath,
    content
  })
  return response.data
}

export async function deleteMemory(projectPath, name) {
  const response = await client.delete(`/serena/memories/${name}`, {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function batchDeleteMemories(projectPath, names) {
  const response = await client.post('/serena/memories/batch-delete', {
    projectPath,
    names
  })
  return response.data
}

export async function getFiles(projectPath) {
  const response = await client.get('/serena/files', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getCacheStatus(projectPath) {
  const response = await client.get('/serena/cache/status', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getSymbols(projectPath, options = {}) {
  const response = await client.get('/serena/symbols', {
    params: withProjectPath({
      filePath: options.filePath || '',
      query: options.query || ''
    }, projectPath)
  })
  return response.data
}

export async function getSymbolReferences(projectPath, symbol) {
  const response = await client.get('/serena/symbols/references', {
    params: withProjectPath({ symbol }, projectPath)
  })
  return response.data
}

export async function getSettings(projectPath) {
  const response = await client.get('/serena/settings', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function saveSettings(projectPath, settings) {
  const response = await client.post('/serena/settings', {
    projectPath,
    settings
  })
  return response.data
}
