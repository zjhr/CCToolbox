import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChannelCard from './ChannelCard.vue'
import * as channelsApi from '../../api/channels'

// Mock API
vi.mock('../../api/channels', () => ({
  fetchChannelModels: vi.fn(() => Promise.resolve({ models: ['api-model-1'] })),
  updateCustomModels: vi.fn(() => Promise.resolve({ success: true }))
}))

describe('ChannelCard', () => {
  const channel = {
    id: 'ch-1',
    name: 'Test Channel',
    customModels: ['custom-1'],
    enabled: true,
    modelConfig: { model: 'gpt-4' }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该能正确显示测速弹窗并在点击外部时关闭', async () => {
    const wrapper = mount(ChannelCard, {
      props: { channel },
      attachTo: document.body
    })

    // 初始状态面板关闭
    expect(wrapper.vm.showTestPanel).toBe(false)

    // 点击测速按钮打开面板
    // 注意：实际项目中按钮选择器可能需要根据 Naive UI 渲染结果调整
    const testBtn = wrapper.findAll('.n-button').find(b => b.text().includes('测速'))
    await testBtn?.trigger('click')
    
    // 等待异步模型加载
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(wrapper.vm.showTestPanel).toBe(true)

    // 模拟点击外部
    const outsideEvent = new Event('pointerdown', { bubbles: true })
    document.dispatchEvent(outsideEvent)
    
    expect(wrapper.vm.showTestPanel).toBe(false)
    wrapper.unmount()
  })

  it('应该能添加和删除自定义模型', async () => {
    const wrapper = mount(ChannelCard, {
      props: { channel }
    })

    // 初始自定义模型列表
    expect(wrapper.vm.localCustomModels).toContain('custom-1')

    // 模拟输入新模型并保存
    await wrapper.vm.handleModelChange('new-custom-model')
    
    expect(channelsApi.updateCustomModels).toHaveBeenCalledWith(
      'ch-1', 
      expect.arrayContaining(['custom-1', 'new-custom-model']),
      'claude'
    )
    expect(wrapper.vm.localCustomModels).toContain('new-custom-model')

    // 模拟删除模型
    await wrapper.vm.removeCustomModel('custom-1')
    
    expect(channelsApi.updateCustomModels).toHaveBeenCalledWith(
      'ch-1',
      ['new-custom-model'],
      'claude'
    )
    expect(wrapper.vm.localCustomModels).not.toContain('custom-1')
  })

  it('modelOptions 应该包含正确的分组', async () => {
    const wrapper = mount(ChannelCard, {
      props: { channel }
    })
    
    // 设置一些模拟的 API 模型
    wrapper.vm.availableModels = ['api-model-1', 'api-model-2']
    
    const options = wrapper.vm.modelOptions
    
    // 检查自动选项
    expect(options[0].value).toBe('__auto__')
    
    // 检查 API 模型分组
    const apiGroup = options.find(o => o.key === 'api-models')
    expect(apiGroup).toBeDefined()
    expect(apiGroup.children.map(c => c.value)).toContain('api-model-1')
    
    // 检查自定义模型分组
    const customGroup = options.find(o => o.key === 'custom-models')
    expect(customGroup).toBeDefined()
    expect(customGroup.children.map(c => c.value)).toContain('custom-1')
  })
})
