import { describe, it, expect } from 'vitest'
import { getPresetById } from './claudePresets'

function collectAnthropicModels(preset) {
  return [
    preset?.env?.ANTHROPIC_MODEL,
    preset?.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    preset?.env?.ANTHROPIC_DEFAULT_SONNET_MODEL,
    preset?.env?.ANTHROPIC_DEFAULT_OPUS_MODEL
  ].filter(Boolean)
}

describe('claudePresets - 默认值更新（Red）', () => {
  it('智谱默认模型应为 glm-5，且仅 Haiku 为 glm-4.7', () => {
    const zhipuPreset = getPresetById('zhipu')
    const models = collectAnthropicModels(zhipuPreset)

    expect(zhipuPreset).toBeTruthy()
    expect(zhipuPreset?.env?.ANTHROPIC_MODEL).toBe('glm-5')
    expect(zhipuPreset?.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.7')
    expect(zhipuPreset?.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('glm-5')
    expect(zhipuPreset?.env?.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('glm-5')
    expect(models).toEqual(
      expect.arrayContaining(['glm-5', 'glm-4.7'])
    )
  })

  it('MiniMax 默认模型应为 MiniMax-M2.5', () => {
    const minimaxPreset = getPresetById('minimax')

    expect(minimaxPreset).toBeTruthy()
    expect(minimaxPreset?.env?.ANTHROPIC_MODEL).toBe('MiniMax-M2.5')
  })

  it('Kimi 预设名称应为 Kimi，默认模型应为 kimi-k2.5', () => {
    const kimiPreset = getPresetById('kimi')

    expect(kimiPreset).toBeTruthy()
    expect(kimiPreset?.name).toBe('Kimi')
    expect(kimiPreset?.env?.ANTHROPIC_MODEL).toBe('kimi-k2.5')
  })

  it('通义千问默认模型应为 qwen3.5-plus', () => {
    const qwenPreset = getPresetById('qwen')

    expect(qwenPreset).toBeTruthy()
    expect(qwenPreset?.env?.ANTHROPIC_MODEL).toBe('qwen3.5-plus')
  })
})
