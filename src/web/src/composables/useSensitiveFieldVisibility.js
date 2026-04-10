import { reactive } from 'vue'

/**
 * 管理敏感字段（如 API Key）显隐状态与显示值计算
 * @param {Object} options
 * @param {(field: { key?: string, type?: string }) => string|undefined} options.resolveRawValue
 */
export default function useSensitiveFieldVisibility(options = {}) {
  const {
    resolveRawValue = () => undefined
  } = options

  const visibleState = reactive({})

  /**
   * 计算字段显示值：密码字段在显示态优先回退到原始值
   * @param {{ key?: string, type?: string }} field
   * @param {unknown} currentValue
   * @returns {unknown}
   */
  function getDisplayValue(field, currentValue) {
    if (field?.type !== 'password') return currentValue
    if (!visibleState[field.key]) return currentValue

    const rawValue = resolveRawValue(field)
    if (typeof rawValue === 'string' && rawValue) {
      return rawValue
    }
    return currentValue
  }

  function isEyeTarget(target, event) {
    if (!target) return false
    if (typeof target.closest === 'function' && target.closest('.n-input__eye')) {
      return true
    }

    if (typeof event?.composedPath === 'function') {
      const path = event.composedPath()
      if (Array.isArray(path)) {
        const matched = path.some((node) => {
          if (!node || typeof node.matches !== 'function') return false
          return node.matches('.n-input__eye')
        })
        if (matched) return true
      }
    }

    let current = target
    while (current) {
      if (typeof current.matches === 'function' && current.matches('.n-input__eye')) {
        return true
      }
      current = current.parentNode || current.host || null
    }
    return false
  }

  /**
   * 响应眼镜图标点击切换密码字段显隐状态
   * @param {{ key?: string, type?: string }} field
   * @param {Event} event
   */
  function toggleByEyeClick(field, event) {
    if (field?.type !== 'password') return
    if (!field?.key) return

    const target = event?.target
    if (!isEyeTarget(target, event)) return
    visibleState[field.key] = !visibleState[field.key]
  }

  return {
    visibleState,
    getDisplayValue,
    toggleByEyeClick
  }
}
