import { ref, onUnmounted } from 'vue'

/**
 * Session 实时更新 Composable
 * @param {Object} options 配置项
 * @param {Function} options.onUpdate 收到新消息时的回调
 * @returns {Object} { messages, isConnected, startWatch, stopWatch }
 */
export function useSessionRealtime(options = {}) {
  const messages = ref([])
  const isConnected = ref(false)
  let socket = null
  let currentSessionId = null
  let currentProjectName = null
  let currentChannel = 'claude'

  /**
   * 开始监听指定 Session
   * @param {string} sessionId 会话 ID
   * @param {string} [projectName] 项目名称（可选，向后兼容）
   * @param {string} [channel='claude'] 会话来源渠道
   */
  const startWatch = (sessionId, projectName, channel = 'claude') => {
    if (!sessionId) return

    const normalizedProjectName = typeof projectName === 'string' && projectName.trim()
      ? projectName
      : null
    const normalizedChannel = typeof channel === 'string' && channel.trim()
      ? channel.trim().toLowerCase()
      : 'claude'

    // 如果已经在监听同一个 sessionId，不需要重连
    if (
      sessionId === currentSessionId
      && normalizedProjectName === currentProjectName
      && normalizedChannel === currentChannel
      && socket
      && socket.readyState === WebSocket.OPEN
    ) {
      return
    }

    stopWatch()
    currentSessionId = sessionId
    currentProjectName = normalizedProjectName
    currentChannel = normalizedChannel

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host || 'localhost:10099'
    const wsUrl = `${protocol}//${host}/ws`

    try {
      socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        isConnected.value = true
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'subscribe-session',
            sessionId,
            projectName: currentProjectName,
            channel: currentChannel
          }))
        }
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'session-update' && data.sessionId === currentSessionId) {
            handleUpdate(data.messages)
          }
        } catch (err) {
          console.error('[useSessionRealtime] Failed to parse message:', err)
        }
      }

      socket.onclose = () => {
        isConnected.value = false
      }

      socket.onerror = (err) => {
        console.error('[useSessionRealtime] WebSocket error:', err)
        isConnected.value = false
      }
    } catch (err) {
      console.error('[useSessionRealtime] Failed to connect:', err)
    }
  }

  /**
   * 停止监听
   */
  const stopWatch = () => {
    if (socket) {
      // 如果还在监听，先尝试发送取消订阅（可选，后端通常在连接断开时自动处理）
      try {
        if (socket.readyState === WebSocket.OPEN && currentSessionId) {
          socket.send(JSON.stringify({
            type: 'unsubscribe-session',
            sessionId: currentSessionId,
            projectName: currentProjectName,
            channel: currentChannel
          }))
        }
      } catch (e) {
        // ignore
      }
      socket.close()
      socket = null
    }
    currentSessionId = null
    currentProjectName = null
    currentChannel = 'claude'
    isConnected.value = false
  }

  /**
   * 处理增量更新
   * @param {Array} newMessages 新收到的消息
   */
  const handleUpdate = (newMessages) => {
    if (!Array.isArray(newMessages)) return

    // 增量追加并去重 (基于 id)
    const existingIds = new Set(messages.value.map(m => m.id))
    const uniqueNewMessages = newMessages.filter(m => m && m.id && !existingIds.has(m.id))

    if (uniqueNewMessages.length > 0) {
      messages.value = [...messages.value, ...uniqueNewMessages]
      if (typeof options.onUpdate === 'function') {
        options.onUpdate(uniqueNewMessages)
      }
    }
  }

  onUnmounted(() => {
    stopWatch()
  })

  return {
    messages,
    isConnected,
    startWatch,
    stopWatch
  }
}
