import { describe, it, expect } from 'vitest'
import channelPanelFactories from './channelPanelFactories'

describe('channelPanelFactories', () => {
  it('claude 配置应该正确包含并处理 enable1M 字段', () => {
    const factory = channelPanelFactories.claude()
    
    // 1. 验证表单定义中包含 enable1M 开关
    const basicSection = factory.formSections.find(s => s.title === '基本信息')
    expect(basicSection).toBeDefined()
    const enable1MField = basicSection?.fields.find(f => f.key === 'enable1M')
    expect(enable1MField).toBeDefined()
    expect(enable1MField?.type).toBe('switch')
    expect(enable1MField?.label).toBe('1M 上下文')

    // 2. 验证初始值
    const initialForm = factory.getInitialForm()
    expect(initialForm.enable1M).toBe(false)

    // 3. 验证从渠道数据映射到表单
    const channelWith1M = { id: 'test-1', enable1M: true, enabled: true }
    const form1 = factory.mapChannelToForm(channelWith1M)
    expect(form1.enable1M).toBe(true)
    expect(form1.channelId).toBe('test-1')

    const channelWithout1M = { id: 'test-2', enabled: true }
    const form2 = factory.mapChannelToForm(channelWithout1M)
    expect(form2.enable1M).toBe(false)
    expect(form2.channelId).toBe('test-2')
  })

  it('新建渠道切换预设时应应用预设名称、baseUrl 和官网地址', () => {
    const factory = channelPanelFactories.claude()
    const createForm = factory.getInitialForm()
    createForm.name = '手动输入名称'
    createForm.baseUrl = 'https://manual-gateway.example.com'
    createForm.websiteUrl = 'https://manual-site.example.com'

    const nextForm = factory.onPresetChange('zhipu', createForm)

    expect(nextForm.presetId).toBe('zhipu')
    expect(nextForm.name).toBe('智谱 GLM')
    expect(nextForm.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic')
    expect(nextForm.websiteUrl).toBe('https://open.bigmodel.cn')
  })

  it('国产预设切换应遵循：新建应用预设、编辑保留名称并覆盖地址', () => {
    const factory = channelPanelFactories.claude()
    const domesticPresets = [
      {
        id: 'zhipu',
        name: '智谱 GLM',
        baseUrl: 'https://open.bigmodel.cn/api/anthropic',
        websiteUrl: 'https://open.bigmodel.cn'
      },
      {
        id: 'minimax',
        name: 'MiniMax',
        baseUrl: 'https://api.minimaxi.com/anthropic',
        websiteUrl: 'https://platform.minimaxi.com'
      },
      {
        id: 'kimi',
        name: 'Kimi',
        baseUrl: 'https://api.moonshot.cn/anthropic',
        websiteUrl: 'https://platform.moonshot.cn'
      },
      {
        id: 'qwen',
        name: '通义千问',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy',
        websiteUrl: 'https://bailian.console.aliyun.com'
      }
    ]

    domesticPresets.forEach((preset) => {
      const createForm = factory.getInitialForm()
      createForm.name = '手动名称'
      createForm.baseUrl = 'https://manual-create.example.com'
      createForm.websiteUrl = 'https://manual-create-site.example.com'

      const nextCreateForm = factory.onPresetChange(preset.id, createForm)
      expect(nextCreateForm.name).toBe(preset.name)
      expect(nextCreateForm.baseUrl).toBe(preset.baseUrl)
      expect(nextCreateForm.websiteUrl).toBe(preset.websiteUrl)

      const editingForm = factory.mapChannelToForm({
        id: 'saved-cn-1',
        name: '编辑态名称',
        presetId: 'official',
        baseUrl: 'https://manual-edit.example.com',
        websiteUrl: 'https://manual-edit-site.example.com',
        apiKey: 'sk-test-123456',
        enabled: true
      })

      const nextEditForm = factory.onPresetChange(preset.id, editingForm)
      expect(nextEditForm.name).toBe('编辑态名称')
      expect(nextEditForm.baseUrl).toBe(preset.baseUrl)
      expect(nextEditForm.websiteUrl).toBe(preset.websiteUrl)
    })
  })
})
