import { describe, it, expect } from 'vitest'
import channelPanelFactories from './channelPanelFactories'

describe('channelPanelFactories - 切换预设不覆盖渠道名称（Red）', () => {
  it('新建渠道时，切换预设后应应用预设名称', () => {
    const factory = channelPanelFactories.claude()
    const createForm = factory.getInitialForm()
    createForm.name = '临时名称'

    const nextForm = factory.onPresetChange('minimax', createForm)

    expect(nextForm.presetId).toBe('minimax')
    expect(nextForm.name).toBe('MiniMax')
  })

  it('编辑已保存渠道时，切换预设后应保留原渠道名称', () => {
    const factory = channelPanelFactories.claude()
    const savedName = '我的自定义渠道名称'

    const editingForm = factory.mapChannelToForm({
      id: 'claude-saved-1',
      name: savedName,
      presetId: 'official',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-live-123456',
      websiteUrl: 'https://www.anthropic.com',
      enabled: true
    })

    const nextForm = factory.onPresetChange('zhipu', editingForm)

    expect(nextForm.presetId).toBe('zhipu')
    expect(nextForm.name).toBe(savedName)
    expect(nextForm.channelId).toBe('claude-saved-1')
  })

  it('切换预设时应保留名称、覆盖地址，并更新模型默认值', () => {
    const factory = channelPanelFactories.claude()
    const editingForm = factory.mapChannelToForm({
      id: 'claude-saved-2',
      name: '自定义渠道',
      presetId: 'official',
      baseUrl: 'https://my.custom.gateway',
      apiKey: 'sk-live-abcdef',
      websiteUrl: 'https://my.custom.portal',
      modelConfig: {
        model: 'old-model',
        haikuModel: '',
        sonnetModel: '',
        opusModel: ''
      },
      enabled: true
    })

    const nextForm = factory.onPresetChange('zhipu', editingForm)

    expect(nextForm.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic')
    expect(nextForm.websiteUrl).toBe('https://open.bigmodel.cn')
    expect(nextForm.modelConfig.model).toBe('glm-5')
    expect(nextForm.modelConfig.haikuModel).toBe('glm-4.7')
    expect(nextForm.modelConfig.opusModel).toBe('glm-5.1')
  })

  it('旧版 DeepSeek 渠道进入编辑弹窗时应自动识别为 DeepSeek 预设', () => {
    const factory = channelPanelFactories.claude()

    const editingForm = factory.mapChannelToForm({
      id: 'claude-legacy-deepseek',
      name: 'Legacy DeepSeek',
      baseUrl: 'https://api.deepseek.com/anthropic',
      apiKey: 'sk-live-deepseek',
      websiteUrl: 'https://platform.deepseek.com',
      modelConfig: {
        model: 'deepseek-v4-pro',
        haikuModel: 'deepseek-v4-flash',
        sonnetModel: 'deepseek-v4-pro',
        opusModel: 'deepseek-v4-pro'
      },
      enabled: true
    })

    expect(editingForm.presetId).toBe('deepseek')
    expect(editingForm.modelConfig.model).toBe('deepseek-v4-pro')
    expect(editingForm.modelConfig.haikuModel).toBe('deepseek-v4-flash')
  })
})
