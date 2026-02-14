import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionsStore } from './sessions'
import { batchDeleteSessions } from '../api/trash'

vi.mock('../api/projects', () => ({
  getProjects: vi.fn(),
  saveProjectOrder: vi.fn(),
  deleteProject: vi.fn()
}))

vi.mock('../api/sessions', () => ({
  getSessions: vi.fn(),
  setAlias: vi.fn(),
  deleteAlias: vi.fn(),
  deleteSession: vi.fn(),
  forkSession: vi.fn(),
  saveSessionOrder: vi.fn()
}))

vi.mock('../api/ai', () => ({
  getSessionMetadata: vi.fn()
}))

vi.mock('../api/trash', () => ({
  batchDeleteSessions: vi.fn(),
  getTrashList: vi.fn(),
  restoreSessions: vi.fn(),
  permanentDeleteSession: vi.fn(),
  emptyTrash: vi.fn()
}))

describe('sessions store batchDelete', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('异步删除时仅保存 taskId 并退出选择模式', async () => {
    vi.mocked(batchDeleteSessions).mockResolvedValue({
      taskId: 'task-100',
      totalCount: 2
    })

    const store = useSessionsStore()
    store.currentProject = 'demo'
    store.currentChannel = 'claude'
    store.selectionMode = true
    store.selectedSessions = new Set(['s-1', 's-2'])

    const result = await store.batchDelete()

    expect(result).toEqual({ taskId: 'task-100', totalCount: 2 })
    expect(store.deleteTaskId).toBe('task-100')
    expect(store.selectionMode).toBe(false)
    expect(store.selectedSessions.size).toBe(0)
    expect(batchDeleteSessions).toHaveBeenCalledWith('demo', ['s-1', 's-2'], 'claude')
  })

  it('删除失败时会记录错误并抛出异常', async () => {
    vi.mocked(batchDeleteSessions).mockRejectedValue(new Error('delete failed'))

    const store = useSessionsStore()
    store.currentProject = 'demo'
    store.currentChannel = 'claude'
    store.selectedSessions = new Set(['s-1'])

    await expect(store.batchDelete()).rejects.toThrow('delete failed')
    expect(store.error).toBe('delete failed')
  })
})
