import { ref, watch, nextTick } from 'vue'
import { useOpenSpecStore } from '../stores/openspec'

export function useOpenSpecEditor() {
  const store = useOpenSpecStore()
  const draft = ref('')
  const saving = ref(false)
  const dirty = ref(false)
  const syncing = ref(false)
  let debounceTimer = null

  watch(
    () => store.currentFile,
    (file) => {
      if (!file) return
      syncing.value = true
      draft.value = file.content || ''
      dirty.value = false
      nextTick(() => {
        syncing.value = false
      })
    },
    { immediate: true }
  )

  watch(draft, (value) => {
    if (syncing.value || !store.currentFile) return
    if (value === store.currentFile.content) return
    dirty.value = true
    if (!store.conflict) {
      scheduleSave()
    }
  })

  function scheduleSave() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      save(true)
    }, 3000)
  }

  function updateDraft(value) {
    draft.value = value
    dirty.value = true
    if (!store.conflict) {
      scheduleSave()
    }
  }

  async function save(isAuto = false) {
    if (!store.currentFile || store.conflict) return
    if (!dirty.value && isAuto) return
    saving.value = true
    try {
      await store.writeFile(store.currentFile.path, draft.value, store.currentFile.etag)
      dirty.value = false
    } finally {
      saving.value = false
    }
  }

  function closeEditor() {
    store.closeEditor()
  }

  function clearTimers() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  return {
    draft,
    saving,
    dirty,
    updateDraft,
    save,
    closeEditor,
    clearTimers
  }
}
