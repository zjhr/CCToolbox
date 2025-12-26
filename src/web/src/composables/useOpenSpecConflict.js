import { computed } from 'vue'
import { useOpenSpecStore } from '../stores/openspec'

export function useOpenSpecConflict() {
  const store = useOpenSpecStore()
  const hasConflict = computed(() => Boolean(store.conflict))

  async function keepLocal() {
    if (!store.conflict) return
    return store.resolveConflict(store.conflict.path, 'local', store.conflict.local)
  }

  async function keepRemote() {
    if (!store.conflict) return
    return store.resolveConflict(store.conflict.path, 'remote')
  }

  async function manualMerge(content) {
    if (!store.conflict) return
    return store.resolveConflict(store.conflict.path, 'merge', content)
  }

  return {
    hasConflict,
    keepLocal,
    keepRemote,
    manualMerge
  }
}
