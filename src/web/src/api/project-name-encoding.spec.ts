import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionSummary } from './ai'
import { client, encodePathSegment } from './client'
import { deleteProject } from './projects'
import { getSessions } from './sessions'
import { batchDeleteSessions } from './trash'

vi.mock('./client', async () => {
  const actual = await vi.importActual('./client')

  return {
    ...actual,
    client: {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      defaults: {
        baseURL: '/api'
      }
    }
  }
})

describe('projectName 路径编码', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('会将 `/` 编码为安全的路径段', () => {
    expect(encodePathSegment('/')).toBe('%2F')
    expect(encodePathSegment('/Users/mac/demo')).toBe('%2FUsers%2Fmac%2Fdemo')
  })

  it('getSessions 会编码项目名', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: { sessions: [] } })

    await getSessions('/', 'codex')

    expect(client.get).toHaveBeenCalledWith('/codex/sessions/%2F')
  })

  it('deleteProject 会编码项目名', async () => {
    vi.mocked(client.delete).mockResolvedValue({ data: { success: true } })

    await deleteProject('/', 'codex')

    expect(client.delete).toHaveBeenCalledWith('/codex/projects/%2F')
  })

  it('batchDeleteSessions 会编码项目名', async () => {
    vi.mocked(client.post).mockResolvedValue({
      data: {
        taskId: 'task-1',
        totalCount: 1
      }
    })

    await batchDeleteSessions('/', ['session-1'], 'codex')

    expect(client.post).toHaveBeenCalledWith(
      '/trash/codex/sessions/%2F/batch-delete',
      { sessionIds: ['session-1'] }
    )
  })

  it('getSessionSummary 会编码项目名', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: { success: true } })

    await getSessionSummary('/', 'session-1')

    expect(client.get).toHaveBeenCalledWith('/ai-assistant/summary/%2F/session-1')
  })
})
