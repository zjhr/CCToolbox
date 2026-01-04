import { ref, onMounted, onUnmounted } from 'vue'
import { checkUpdate as checkUpdateApi, executeUpdate } from '../api/update'

export function useUpdateChecker() {
  const hasUpdate = ref(false)
  const updateInfo = ref(null)
  const isUpdating = ref(false)
  const updateProgress = ref(null)
  const connected = ref(false)

  let ws = null
  let reconnectTimer = null
  let reconnectAttempts = 0
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
        reconnectAttempts = 0
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleMessage(data)
        } catch (err) {
          console.error('更新消息解析失败:', err)
        }
      }

      ws.onclose = () => {
        connected.value = false
        ws = null
        if (allowReconnect) {
          scheduleReconnect()
        }
      }

      ws.onerror = () => {
        connected.value = false
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
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 15000)
    reconnectAttempts += 1
    reconnectTimer = setTimeout(connect, delay)
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

  function handleMessage(data) {
    if (!data || typeof data.type !== 'string') return

    switch (data.type) {
      case 'update-available':
        hasUpdate.value = true
        updateInfo.value = {
          type: data.updateType || 'git',
          current: data.current,
          remote: data.remote,
          timestamp: data.timestamp
        }
        break
      case 'update-progress':
        isUpdating.value = true
        updateProgress.value = {
          step: data.step,
          total: data.total,
          message: data.message,
          progress: data.progress,
          output: data.output,
          steps: data.steps || [],
          status: 'in_progress'
        }
        break
      case 'update-complete':
        isUpdating.value = false
        updateProgress.value = {
          ...updateProgress.value,
          message: data.message || '更新完成',
          progress: 100,
          status: 'completed',
          newVersion: data.newVersion
        }
        break
      case 'update-error':
        isUpdating.value = false
        updateProgress.value = {
          ...updateProgress.value,
          message: data.message || '更新失败',
          error: data.error,
          status: 'failed'
        }
        break
      default:
        break
    }
  }

  async function checkUpdate() {
    try {
      const result = await checkUpdateApi()
      if (result.type === 'git' && result.hasUpdate && !result.error) {
        hasUpdate.value = true
        updateInfo.value = {
          type: 'git',
          current: result.current,
          remote: result.latest,
          timestamp: Date.now()
        }
      }
      return result
    } catch (err) {
      console.error('检查更新失败:', err)
      return { hasUpdate: false }
    }
  }

  async function startUpdate() {
    if (isUpdating.value) return
    try {
      isUpdating.value = true
      const result = await executeUpdate()
      if (result.success === false) {
        isUpdating.value = false
      }
      return result
    } catch (err) {
      isUpdating.value = false
      console.error('启动更新失败:', err)
      return { success: false, error: err.message }
    }
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    hasUpdate,
    updateInfo,
    isUpdating,
    updateProgress,
    connected,
    startUpdate,
    checkUpdate,
    connect,
    disconnect
  }
}
