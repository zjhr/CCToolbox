import { describe, it, expect } from 'vitest'
import useSensitiveFieldVisibility from './useSensitiveFieldVisibility'

describe('useSensitiveFieldVisibility', () => {
  it('密码字段点击眼镜（含 svg/path 目标）后应显示原始值，再次点击恢复当前值', () => {
    const fullApiKey = 'sk-live-abcdef123456'
    const maskedApiKey = 'sk-liv*************'
    const field = { key: 'apiKey', type: 'password' }

    const { getDisplayValue, toggleByEyeClick } = useSensitiveFieldVisibility({
      resolveRawValue: (inputField) => {
        if (inputField.key === 'apiKey') return fullApiKey
        return undefined
      }
    })

    // 初始应显示当前值（掩码）
    expect(getDisplayValue(field, maskedApiKey)).toBe(maskedApiKey)

    // 点击眼镜内部 svg/path 后应显示原始值
    const eye = document.createElement('span')
    eye.className = 'n-input__eye'
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    eye.appendChild(path)

    const clickEvent = {
      target: path,
      composedPath: () => [path, eye]
    } as unknown as Event

    toggleByEyeClick(field, clickEvent)
    expect(getDisplayValue(field, maskedApiKey)).toBe(fullApiKey)

    // 再次点击应恢复当前值
    toggleByEyeClick(field, clickEvent)
    expect(getDisplayValue(field, maskedApiKey)).toBe(maskedApiKey)
  })

  it('非密码字段或非眼镜点击不应触发切换', () => {
    const { getDisplayValue, toggleByEyeClick } = useSensitiveFieldVisibility({
      resolveRawValue: () => 'raw-value'
    })

    const nonPasswordField = { key: 'name', type: 'text' }
    const passwordField = { key: 'apiKey', type: 'password' }
    const plainTarget = document.createElement('span')
    plainTarget.className = 'not-eye'

    toggleByEyeClick(nonPasswordField, { target: plainTarget } as unknown as Event)
    expect(getDisplayValue(nonPasswordField, 'channel-name')).toBe('channel-name')

    toggleByEyeClick(passwordField, { target: plainTarget } as unknown as Event)
    expect(getDisplayValue(passwordField, 'masked')).toBe('masked')
  })
})
