/**
 * 原值提示规则（集中化配置）
 * - sourceKeys: 从编辑前渠道对象读取原值时的候选字段
 * - textPrefix: 提示文案前缀（统一在此维护）
 */
const DEFAULT_FIELD_HINT_RULES = {
  baseUrl: {
    sourceKeys: ['baseUrl', 'baseURL'],
    textPrefix: '原已保存 Base URL：'
  },
  websiteUrl: {
    sourceKeys: ['websiteUrl', 'websiteLink'],
    textPrefix: '原已保存官网：'
  }
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function readFirstValue(source, keys) {
  if (!source || !Array.isArray(keys)) return ''
  for (const key of keys) {
    if (hasValue(source[key])) return source[key]
  }
  return ''
}

/**
 * 字段提示 composable
 * @param {Object} options
 * @param {() => boolean} options.shouldShow
 * @param {() => Object|null|undefined} options.getSource
 * @param {Record<string, {sourceKeys: string[], textPrefix: string}>} options.rules
 */
export default function useFieldHint(options = {}) {
  const {
    shouldShow = () => true,
    getSource = () => null,
    rules = DEFAULT_FIELD_HINT_RULES
  } = options

  function getFieldHint(fieldKey) {
    if (!shouldShow()) return ''
    const rule = rules[fieldKey]
    if (!rule) return ''

    const source = getSource()
    const originalValue = readFirstValue(source, rule.sourceKeys)
    if (!hasValue(originalValue)) return ''

    return `${rule.textPrefix}${originalValue}`
  }

  return {
    getFieldHint
  }
}

