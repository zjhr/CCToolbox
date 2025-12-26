import { ref } from 'vue'
import { useOpenSpecStore } from '../stores/openspec'
import { applyUnifiedPatch } from '../utils/diffUtils'

export function useOpenSpecSync() {
  const store = useOpenSpecStore()
  const connected = ref(false)
  const reconnectAttempts = ref(0)
  let ws = null
  let reconnectTimer = null
  let allowReconnect = false

  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return
    allowReconnect = true
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    try {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        connected.value = true
        reconnectAttempts.value = 0
        store.syncStatus = 'synced'
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type !== 'openspec-change') return
          if (store.projectPath && data.projectPath && data.projectPath !== store.projectPath) return

          const applied = tryApplyDiff(data)
          if (!applied) {
            store.updateFromRemote(data)
            if (store.currentFile?.path === data.path) {
              store.readFile(data.path)
            }
          }
        } catch (err) {
          console.error('OpenSpec WS 消息解析失败:', err)
        }
      }

      ws.onclose = () => {
        connected.value = false
        ws = null
        store.syncStatus = 'error'
        if (allowReconnect) {
          scheduleReconnect()
        }
      }

      ws.onerror = () => {
        connected.value = false
        store.syncStatus = 'error'
      }
    } catch (err) {
      connected.value = false
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 15000)
    reconnectAttempts.value += 1
    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  function disconnect() {
    allowReconnect = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
    connected.value = false
  }

  function tryApplyDiff(change) {
    if (!change.diff) return false
    const cached = store.fileCache.get(change.path)
    if (!cached?.content) return false

    const patched = applyUnifiedPatch(cached.content, change.diff)
    if (!patched) return false

    const payload = {
      content: patched,
      etag: change.etag || cached.etag,
      size: change.size || patched.length,
      isLarge: change.isLarge || false
    }
    store.fileCache.set(change.path, payload)
    if (store.currentFile?.path === change.path) {
      store.currentFile = { path: change.path, ...payload }
    }
    store.lastUpdated = Date.now()
    return true
  }

  return {
    connected,
    connect,
    disconnect
  }
}
