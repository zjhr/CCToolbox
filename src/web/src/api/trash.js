import { client, encodePathSegment } from './client'

export async function batchDeleteSessions(projectName, sessionIds, channel = 'claude') {
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.post(`/trash/${channel}/sessions/${encodedProjectName}/batch-delete`, { sessionIds })
  return {
    taskId: response.data?.taskId,
    totalCount: response.data?.totalCount ?? sessionIds.length
  }
}

export function getDeleteProgressUrl(taskId, lastEventId = null) {
  const params = new URLSearchParams({ taskId })
  if (lastEventId) {
    params.set('lastEventId', String(lastEventId))
  }
  return `/api/trash/delete-progress?${params.toString()}`
}

export async function getTrashList(projectName, channel = 'claude') {
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.get(`/trash/${channel}/sessions/${encodedProjectName}/trash`)
  return response.data
}

export async function restoreSessions(projectName, trashIds, channel = 'claude', aliasStrategy = null) {
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.post(`/trash/${channel}/sessions/${encodedProjectName}/trash/restore`, {
    trashIds,
    aliasStrategy
  })
  return response.data
}

export async function permanentDeleteSession(projectName, trashId, channel = 'claude') {
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.delete(`/trash/${channel}/sessions/${encodedProjectName}/trash/${trashId}`)
  return response.data
}

export async function emptyTrash(projectName, channel = 'claude') {
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.delete(`/trash/${channel}/sessions/${encodedProjectName}/trash`)
  return response.data
}

export async function getTrashMessages(projectName, trashId, page = 1, limit = 20, order = 'desc', channel = 'claude') {
  const encodedProjectName = encodePathSegment(projectName)
  const response = await client.get(`/trash/${channel}/sessions/${encodedProjectName}/trash/${trashId}/messages`, {
    params: { page, limit, order }
  })
  return response.data
}
