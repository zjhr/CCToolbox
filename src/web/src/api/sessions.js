import { client, encodePathSegment, getChannelPrefix } from './client'

export async function getSessions(projectName, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.get(`${prefix}/sessions/${encodedProjectName}`)
  return response.data
}

export async function setAlias(sessionId, alias) {
  const response = await client.post('/aliases', { sessionId, alias })
  return response.data
}

export async function deleteAlias(sessionId) {
  const response = await client.delete(`/aliases/${sessionId}`)
  return response.data
}

export async function deleteSession(projectName, sessionId, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.delete(`${prefix}/sessions/${encodedProjectName}/${sessionId}`)
  return response.data
}

export async function forkSession(projectName, sessionId, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.post(`${prefix}/sessions/${encodedProjectName}/${sessionId}/fork`)
  return response.data
}

export async function launchSession(projectName, sessionId, fork = false, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.post(`${prefix}/sessions/${encodedProjectName}/${sessionId}/launch`, { fork })
  return response.data
}

export async function saveSessionOrder(projectName, order, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.post(`${prefix}/sessions/${encodedProjectName}/order`, { order })
  return response.data
}

export async function searchSessions(projectName, keyword, contextLength = 15, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.get(`${prefix}/sessions/${encodedProjectName}/search`, {
    params: { keyword, context: contextLength }
  })
  return response.data
}

export async function searchSessionsGlobally(keyword, contextLength = 35, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const response = await client.get(`${prefix}/sessions/search/global`, {
    params: { keyword, context: contextLength }
  })
  return response.data
}

export async function searchSessionMessages(projectName, sessionId, keyword, contextLength = 20, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const normalizedSessionId = String(sessionId ?? '')
  const encodedSessionId = encodePathSegment(normalizedSessionId)

  // Codex/Gemini 单会话搜索目前会复用 Claude 的 jsonl 文件定位逻辑，这里改为项目搜索后按 sessionId 过滤，避免误报 Session file not found。
  if (channel === 'codex' || channel === 'gemini') {
    const projectSearchResponse = await client.get(`${prefix}/sessions/${encodedProjectName}/search`, {
      params: { keyword, context: contextLength }
    })
    const sessions = Array.isArray(projectSearchResponse.data?.sessions) ? projectSearchResponse.data.sessions : []
    const matchedSession = sessions.find((item) => String(item?.sessionId ?? '') === normalizedSessionId)
    return {
      matches: Array.isArray(matchedSession?.matches) ? matchedSession.matches : []
    }
  }

  const response = await client.get(`${prefix}/sessions/${encodedProjectName}/${encodedSessionId}/search`, {
    params: { keyword, context: contextLength }
  })
  return response.data
}

export async function launchTerminal(projectName, sessionId, channel = 'claude', options = {}) {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.post(`${prefix}/sessions/${encodedProjectName}/${sessionId}/launch`, {
    terminalId: options.terminalId || null,
    clipboardOnly: options.clipboardOnly || false
  })
  return response.data
}

export async function getTerminalClipboardCommand(projectName, sessionId, channel = 'claude') {
  return launchTerminal(projectName, sessionId, channel, { clipboardOnly: true })
}

export async function getSessionMessages(projectName, sessionId, page = 1, limit = 20, order = 'desc', channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.get(`${prefix}/sessions/${encodedProjectName}/${sessionId}/messages`, {
    params: { page, limit, order }
  })
  return response.data
}

export async function getSubagentMessages(projectName, sessionId, agentId, page = 1, pageSize = 20, order = 'desc', channel = 'claude') {
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.get(`/sessions/${encodedProjectName}/${sessionId}/subagent/${agentId}`, {
    params: { page, pageSize, order, channel }
  })
  return response.data
}

export async function getRecentSessions(limit = 5, channel = 'claude') {
  const prefix = getChannelPrefix(channel)
  const response = await client.get(`${prefix}/sessions/recent/list?limit=${limit}`)
  return response.data
}
