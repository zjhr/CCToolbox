import { watch, onBeforeUnmount } from 'vue'
import { useOpenSpecStore } from '../stores/openspec'

export function useOpenSpecRefresh(visibleRef) {
  const store = useOpenSpecStore()
  let timer = null

  function start(intervalMs) {
    stop()
    const interval = intervalMs || store.data.settings?.refreshInterval || 15000
    timer = setInterval(() => {
      if (store.drawerOpen) {
        store.refreshTab(store.activeTab)
      }
    }, interval)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  watch(visibleRef, (val) => {
    if (val) {
      if (store.data.settings?.autoRefresh !== false) {
        start(store.data.settings?.refreshInterval)
      }
    } else {
      stop()
    }
  })

  watch(
    () => store.data.settings,
    (settings) => {
      if (!store.drawerOpen) return
      if (settings?.autoRefresh === false) {
        stop()
        return
      }
      start(settings?.refreshInterval)
    }
  )

  onBeforeUnmount(() => {
    stop()
  })

  return {
    start,
    stop
  }
}
