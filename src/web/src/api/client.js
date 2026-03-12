import axios from 'axios'

export const client = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 将项目名等动态路径段进行编码，避免 `/` 被当成路由分隔符。
export function encodePathSegment(value) {
  return encodeURIComponent(String(value ?? ''))
}

export function getChannelPrefix(channel = 'claude') {
  if (channel === 'codex') return '/codex'
  if (channel === 'gemini') return '/gemini'
  return ''
}
