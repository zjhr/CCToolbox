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

  it('显示态下用户输入新密钥或清空时，应保留当前输入值', () => {
    const fullApiKey = 'sk-live-oldkey'
    const maskedApiKey = 'sk-li*********'
    const editedApiKey = 'sk-live-newkey'
    const field = { key: 'apiKey', type: 'password' }

    const { getDisplayValue, toggleByEyeClick } = useSensitiveFieldVisibility({
      resolveRawValue: (inputField) => {
        if (inputField.key === 'apiKey') return fullApiKey
        return undefined
      }
    })

    const eye = document.createElement('span')
    eye.className = 'n-input__eye'
    const clickEvent = {
      target: eye,
      composedPath: () => [eye]
    } as unknown as Event

    // 切换到显示态
    toggleByEyeClick(field, clickEvent)

    // 初始掩码值仍应回退到原始密钥
    expect(getDisplayValue(field, maskedApiKey)).toBe(fullApiKey)

    // 用户输入新密钥后，不应再被旧密钥覆盖
    expect(getDisplayValue(field, editedApiKey)).toBe(editedApiKey)

    // 用户清空后应保持空字符串（可删除）
    expect(getDisplayValue(field, '')).toBe('')
  })

  it('短密钥掩码（少于4个星号）在显示态也应回退到原始值', () => {
    const fullApiKey = 'abc1234'
    const maskedApiKey = 'abc***'
    const field = { key: 'apiKey', type: 'password' }

    const { getDisplayValue, toggleByEyeClick } = useSensitiveFieldVisibility({
      resolveRawValue: () => fullApiKey
    })

    const eye = document.createElement('span')
    eye.className = 'n-input__eye'
    toggleByEyeClick(field, {
      target: eye,
      composedPath: () => [eye]
    } as unknown as Event)

    expect(getDisplayValue(field, maskedApiKey)).toBe(fullApiKey)
  })
})
