import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { initializeGlobalState } from './composables/useGlobalState'

const LEGACY_STORAGE_PREFIX = 'cc-tool-'
const NEW_STORAGE_PREFIX = 'cctoolbox-'
const STORAGE_MIGRATION_KEY = 'cctoolbox-localstorage-migration'
const STORAGE_CLEANUP_TTL = 7 * 24 * 60 * 60 * 1000

function migrateLocalStorageKeys() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  const now = Date.now()
  let meta = null

  try {
    const raw = window.localStorage.getItem(STORAGE_MIGRATION_KEY)
    meta = raw ? JSON.parse(raw) : null
  } catch (error) {
    meta = null
  }

  const legacyKeys = []
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i)
    if (key && key.startsWith(LEGACY_STORAGE_PREFIX)) {
      legacyKeys.push(key)
    }
  }

  if (legacyKeys.length > 0) {
    legacyKeys.forEach((key) => {
      const newKey = NEW_STORAGE_PREFIX + key.slice(LEGACY_STORAGE_PREFIX.length)
      if (window.localStorage.getItem(newKey) === null) {
        window.localStorage.setItem(newKey, window.localStorage.getItem(key))
      }
    })

    const mergedMeta = {
      migratedAt: meta?.migratedAt || now,
      legacyKeys: Array.from(new Set([...(meta?.legacyKeys || []), ...legacyKeys]))
    }
    window.localStorage.setItem(STORAGE_MIGRATION_KEY, JSON.stringify(mergedMeta))
    meta = mergedMeta
  }

  if (meta?.migratedAt && now - meta.migratedAt > STORAGE_CLEANUP_TTL) {
    const keysToRemove = meta.legacyKeys || []
    keysToRemove.forEach((key) => {
      if (key && key.startsWith(LEGACY_STORAGE_PREFIX)) {
        window.localStorage.removeItem(key)
      }
    })
    window.localStorage.removeItem(STORAGE_MIGRATION_KEY)
  }
}

// Naive UI - no need to import CSS, it's built-in
migrateLocalStorageKeys()
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')

// 注册 Service Worker，满足桌面安装条件
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service Worker 注册失败:', error)
    })
  })
}

// 初始化全局状态（WebSocket 连接和状态管理）
initializeGlobalState()
