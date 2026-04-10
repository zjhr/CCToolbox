import { describe, it, expect } from 'vitest'
import channelPanelFactories from './channelPanelFactories'

describe('channelPanelFactories - 切换预设不覆盖渠道名称（Red）', () => {
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
  })

  it('切换预设时应保留已填写的 baseUrl 和 websiteUrl，同时更新模型默认值', () => {
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

    expect(nextForm.baseUrl).toBe('https://my.custom.gateway')
    expect(nextForm.websiteUrl).toBe('https://my.custom.portal')
    expect(nextForm.modelConfig.model).toBe('glm-4.7')
  })
})
