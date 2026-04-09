import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SessionList from './SessionList.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionsStore } from '../stores/sessions'

// Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ meta: { channel: 'claude' } })
}))

// Mock API
vi.mock('../api/sessions', () => ({
  searchSessions: vi.fn()
}))

describe('SessionList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该能成功渲染刷新按钮并调用刷新 store 逻辑', async () => {
    const store = useSessionsStore()
    // 模拟 fetchSessions
    vi.spyOn(store, 'fetchSessions').mockImplementation(() => Promise.resolve())

    const wrapper = mount(SessionList, {
      props: { projectName: 'test-project' },
      global: {
        // 简单地 stub 掉大部分 Naive UI 组件以避免渲染复杂性
        stubs: {
          'n-button': true,
          'n-icon': true,
          'n-input': true,
          'n-select': true,
          'n-tag': true,
          'n-tooltip': true,
          'n-dropdown': true,
          'n-modal': true,
          'n-alert': true,
          'n-spin': true,
          'n-empty': true,
          'n-checkbox': true,
          'draggable': true,
          'ChatHistoryDrawer': true,
          'OpenSpecDrawer': true,
          'SerenaDrawer': true,
          'AliasModal': true,
          'DeleteConfirmModal': true,
          'TrashModal': true,
          'AliasConflictModal': true,
          'ProgressBar': true,
          'TerminalLauncher': true
        }
      }
    })

    // 查找刷新按钮
    const refreshBtn = wrapper.find('.refresh-button')
    expect(refreshBtn.exists()).toBe(true)

    // 点击刷新按钮
    await refreshBtn.trigger('click')

    // 验证 store 的 fetchSessions 是否被调用，且带了 force: true 参数
    expect(store.fetchSessions).toHaveBeenCalledWith('test-project', { force: true })
  })
})
