import { client } from './client'

function withProjectPath(params, projectPath) {
  return {
    ...params,
    projectPath
  }
}

export async function getDashboard(projectPath) {
  const response = await client.get('/openspec/dashboard', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getProjects(projectPath) {
  const response = await client.get('/openspec/projects', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getSpecs(projectPath) {
  const response = await client.get('/openspec/specs', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getChanges(projectPath) {
  const response = await client.get('/openspec/changes', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getArchives(projectPath) {
  const response = await client.get('/openspec/archives', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function getSettings(projectPath) {
  const response = await client.get('/openspec/settings', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function saveSettings(projectPath, settings) {
  const response = await client.post('/openspec/settings', {
    projectPath,
    settings
  })
  return response.data
}

export async function readFile(projectPath, filePath) {
  const response = await client.get('/openspec/files/read', {
    params: withProjectPath({ path: filePath }, projectPath)
  })
  return response.data
}

export async function writeFile(projectPath, filePath, content, etag) {
  const response = await client.post('/openspec/files/write', {
    projectPath,
    path: filePath,
    content,
    etag
  })
  return response.data
}

export async function getDiff(projectPath, filePath) {
  const response = await client.get('/openspec/files/diff', {
    params: withProjectPath({ path: filePath }, projectPath)
  })
  return response.data
}

export async function resolveConflict(projectPath, filePath, resolution, content) {
  const response = await client.post('/openspec/files/resolve', {
    projectPath,
    path: filePath,
    resolution,
    content
  })
  return response.data
}

export async function getCliInfo() {
  const response = await client.get('/openspec/cli')
  return response.data
}

export async function getTools(projectPath) {
  const response = await client.get('/openspec/tools', {
    params: withProjectPath({}, projectPath)
  })
  return response.data
}

export async function initTools(projectPath, tools) {
  const response = await client.post('/openspec/tools/init', {
    projectPath,
    tools
  })
  return response.data
}
