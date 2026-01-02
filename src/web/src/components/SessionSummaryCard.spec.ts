import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SessionSummaryCard from './SessionSummaryCard.vue'
import { getSessionSummary, summarizeSession } from '../api/ai'

vi.mock('../api/ai', () => ({
  getSessionSummary: vi.fn(),
  summarizeSession: vi.fn()
}))

vi.mock('../utils/message', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@vicons/ionicons5', () => ({
  DocumentTextOutline: {},
  RefreshOutline: {},
  ChevronDownOutline: {},
  ChevronUpOutline: {}
}))

const flushPromises = () => new Promise(resolve => setTimeout(resolve))

const stubs = {
  'n-card': { template: '<div><slot /></div>' },
  'n-button': { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
  'n-icon': { template: '<span><slot /></span>' },
  'n-spin': { template: '<div><slot /></div>' },
  'n-empty': { template: '<div><slot /><slot name="extra" /></div>' },
  'n-tag': { template: '<span><slot /></span>' },
  'n-collapse-transition': { template: '<div><slot /></div>' }
}

describe('SessionSummaryCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getSessionSummary.mockResolvedValue({ success: false })
    summarizeSession.mockResolvedValue({ success: true, data: { summary: '## 默认', modelUsed: 'openai' } })
  })

  it('挂载时拉取总结信息', async () => {
    getSessionSummary.mockResolvedValue({
      success: true,
      data: { summary: '## 内容', modelUsed: 'openai', generatedAt: '2024-01-01T00:00:00Z' }
    })

    const wrapper = mount(SessionSummaryCard, {
      props: {
        projectName: 'demo-project',
        sessionId: 'session-1',
        disabled: false
      },
      global: { stubs }
    })

    await nextTick()
    await flushPromises()

    expect(wrapper.vm.summaryData.summary).toContain('## 内容')
  })

  it('点击生成会更新总结并展开', async () => {
    summarizeSession.mockResolvedValue({
      success: true,
      data: { summary: '## 新总结', modelUsed: 'openai' }
    })

    const wrapper = mount(SessionSummaryCard, {
      props: {
        projectName: 'demo-project',
        sessionId: 'session-2',
        disabled: false
      },
      global: { stubs }
    })

    await nextTick()
    await flushPromises()

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await flushPromises()

    expect(summarizeSession).toHaveBeenCalledWith({
      projectName: 'demo-project',
      sessionId: 'session-2'
    })
    expect(wrapper.vm.summaryData.summary).toContain('## 新总结')
    expect(wrapper.vm.expanded).toBe(true)
  })
})
