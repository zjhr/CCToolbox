import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batchDeleteSessions, getDeleteProgressUrl } from './trash'
import { client } from './client'

vi.mock('./client', () => ({
  client: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    defaults: {
      baseURL: '/api'
    }
  }
}))

describe('trash api', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('batchDeleteSessions 解析 202 响应结构', async () => {
    vi.mocked(client.post).mockResolvedValue({
      data: {
        taskId: 'delete-task-1',
        totalCount: 3
      }
    })

    const result = await batchDeleteSessions('demo', ['s1', 's2', 's3'], 'claude')

    expect(client.post).toHaveBeenCalledWith(
      '/trash/claude/sessions/demo/batch-delete',
      { sessionIds: ['s1', 's2', 's3'] }
    )
    expect(result).toEqual({
      taskId: 'delete-task-1',
      totalCount: 3
    })
  })

  it('getDeleteProgressUrl 会构建 SSE 地址', () => {
    const url = getDeleteProgressUrl('task-1')
    const reconnectUrl = getDeleteProgressUrl('task-1', '7')

    expect(url).toBe('/api/trash/delete-progress?taskId=task-1')
    expect(reconnectUrl).toBe('/api/trash/delete-progress?taskId=task-1&lastEventId=7')
  })
})
