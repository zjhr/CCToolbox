import { computed, onBeforeUnmount, ref } from 'vue'
import { getDeleteProgressUrl } from '../api/trash'

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 8000

function createInitialProgress() {
  return {
    taskId: '',
    completed: 0,
    total: 0,
    percentage: 0,
    status: 'idle',
    current: null,
    errors: []
  }
}

export function useDeleteProgress() {
  const progress = ref(createInitialProgress())
  const status = ref('idle')
  const error = ref(null)
  const taskId = ref('')
  const lastEventId = ref(null)
  const retryCount = ref(0)

  let source = null
  let reconnectTimer = null

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function closeSource() {
    if (source) {
      source.close()
      source = null
    }
  }

  function resetState(nextTaskId = '') {
    taskId.value = nextTaskId
    lastEventId.value = null
    retryCount.value = 0
    error.value = null
    progress.value = {
      ...createInitialProgress(),
      taskId: nextTaskId
    }
    status.value = nextTaskId ? 'connecting' : 'idle'
  }

  function mergeProgress(payload) {
    progress.value = {
      ...progress.value,
      ...payload,
      taskId: taskId.value
    }
  }

  function parseEventPayload(event) {
    if (!event || !event.data) return null
    try {
      return JSON.parse(event.data)
    } catch (err) {
      return null
    }
  }

  function scheduleReconnect() {
    if (!taskId.value || status.value === 'completed' || status.value === 'failed') {
      return
    }

    const delay = Math.min(RECONNECT_BASE_DELAY_MS * (2 ** retryCount.value), RECONNECT_MAX_DELAY_MS)
    clearReconnectTimer()
    reconnectTimer = setTimeout(() => {
      retryCount.value += 1
      connect()
    }, delay)
  }

  function connect() {
    if (!taskId.value) return
    if (typeof EventSource === 'undefined') {
      status.value = 'error'
      error.value = '当前环境不支持 EventSource'
      return
    }

    closeSource()
    clearReconnectTimer()
    status.value = retryCount.value > 0 ? 'reconnecting' : 'connecting'

    source = new EventSource(getDeleteProgressUrl(taskId.value, lastEventId.value))

    source.onopen = () => {
      retryCount.value = 0
      status.value = 'running'
      error.value = null
    }

    source.addEventListener('progress', (event) => {
      const payload = parseEventPayload(event)
      if (!payload) return
      if (event.lastEventId) {
        lastEventId.value = event.lastEventId
      }
      mergeProgress(payload)
      status.value = 'running'
      error.value = null
    })

    source.addEventListener('error', (event) => {
      const payload = parseEventPayload(event)
      if (!payload) return
      if (event.lastEventId) {
        lastEventId.value = event.lastEventId
      }
      const nextErrors = Array.isArray(progress.value.errors) ? [...progress.value.errors] : []
      nextErrors.push({
        sessionId: payload.sessionId || '',
        error: payload.error || '删除失败'
      })
      mergeProgress({
        errors: nextErrors
      })
    })

    source.addEventListener('complete', (event) => {
      const payload = parseEventPayload(event)
      if (!payload) return
      if (event.lastEventId) {
        lastEventId.value = event.lastEventId
      }

      mergeProgress({
        ...payload,
        percentage: payload.percentage ?? 100
      })
      status.value = payload.status || 'completed'
      closeSource()
    })

    source.onerror = () => {
      if (!source) {
        return
      }
      if (status.value === 'completed' || status.value === 'failed') {
        closeSource()
        return
      }
      closeSource()
      status.value = 'reconnecting'
      scheduleReconnect()
    }
  }

  function start(nextTaskId) {
    if (!nextTaskId) {
      throw new Error('taskId is required')
    }
    closeSource()
    clearReconnectTimer()
    resetState(nextTaskId)
    connect()
  }

  function stop(options = {}) {
    const shouldReset = typeof options === 'boolean'
      ? options
      : Boolean(options?.reset)
    closeSource()
    clearReconnectTimer()
    if (shouldReset) {
      resetState('')
    }
  }

  const isRunning = computed(() => ['connecting', 'running', 'reconnecting'].includes(status.value))

  onBeforeUnmount(() => {
    stop({ reset: true })
  })

  return {
    taskId,
    progress,
    status,
    error,
    lastEventId,
    isRunning,
    start,
    stop,
    reconnect: connect
  }
}
