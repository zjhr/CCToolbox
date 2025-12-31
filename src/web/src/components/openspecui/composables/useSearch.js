import { computed, ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'

const DEFAULT_DEBOUNCE = 300

export function parseSearchQuery(query = '') {
  const terms = []
  let current = ''
  let inQuotes = false
  const text = String(query || '').trim()

  for (const char of text) {
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ' ' && !inQuotes) {
      if (current) {
        terms.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) {
    terms.push(current)
  }

  return terms
}

function getSearchTokens(query = '') {
  const terms = parseSearchQuery(query)
  const tokens = []
  terms.forEach((term) => {
    const parts = String(term || '').split('*')
    parts.forEach((part) => {
      const cleaned = part.trim()
      if (cleaned) tokens.push(cleaned)
    })
  })
  return Array.from(new Set(tokens))
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSearchRegex(query, flags = 'gi') {
  const tokens = getSearchTokens(query)
  if (!tokens.length) return null
  const pattern = tokens.map(escapeRegex).join('|')
  return new RegExp(`(${pattern})`, flags)
}

function matchTerm(text, term) {
  if (!term) return true
  const lowerText = text.toLowerCase()
  const lowerTerm = term.toLowerCase()
  if (!lowerTerm.includes('*')) {
    return lowerText.includes(lowerTerm)
  }
  const pattern = lowerTerm
    .split('*')
    .map(part => escapeRegex(part))
    .join('.*')
  const regex = new RegExp(pattern, 'i')
  return regex.test(text)
}

export function highlightMatches(text = '', query = '') {
  const safe = escapeHtml(text)
  const regex = buildSearchRegex(query, 'gi')
  if (!regex) return safe
  return safe.replace(regex, '<mark class="search-highlight">$1</mark>')
}

export function getSearchSnippet(text = '', query = '', maxLength = 120) {
  const content = String(text || '').replace(/\s+/g, ' ').trim()
  if (!content) return ''
  const regex = buildSearchRegex(query, 'i')
  if (!regex) return content.slice(0, maxLength)
  const match = regex.exec(content)
  if (!match) return content.slice(0, maxLength)
  const start = Math.max(0, match.index - 40)
  const end = Math.min(content.length, match.index + match[0].length + 60)
  let snippet = content.slice(start, end).trim()
  if (start > 0) snippet = `...${snippet}`
  if (end < content.length) snippet = `${snippet}...`
  return snippet
}

export function filterBySearchQuery(items = [], query = '', options = {}) {
  const terms = parseSearchQuery(query)
  if (!terms.length) return items
  const fields = options.fields || []
  const getSearchText = options.getSearchText
  return items.filter((item) => {
    const text = getSearchText
      ? getSearchText(item)
      : fields.map((field) => String(item?.[field] || '')).join(' ')
    return terms.every(term => matchTerm(String(text || ''), term))
  })
}

export function useSearch(itemsRef, options = {}) {
  const query = ref('')
  const debounce = options.debounce ?? DEFAULT_DEBOUNCE

  const applyQuery = useDebounceFn((value) => {
    query.value = value || ''
  }, debounce)

  const filteredItems = computed(() => {
    return filterBySearchQuery(itemsRef.value || [], query.value, options)
  })

  return {
    query,
    setQuery: applyQuery,
    filteredItems
  }
}
