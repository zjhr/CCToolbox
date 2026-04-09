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
    expect(enable1MField?.label).toBe('开启 1M 上下文')

    // 2. 验证初始值
    const initialForm = factory.getInitialForm()
    expect(initialForm.enable1M).toBe(false)

    // 3. 验证从渠道数据映射到表单
    const channelWith1M = { id: 'test-1', enable1M: true, enabled: true }
    const form1 = factory.mapChannelToForm(channelWith1M)
    expect(form1.enable1M).toBe(true)

    const channelWithout1M = { id: 'test-2', enabled: true }
    const form2 = factory.mapChannelToForm(channelWithout1M)
    expect(form2.enable1M).toBe(false)
  })
})
