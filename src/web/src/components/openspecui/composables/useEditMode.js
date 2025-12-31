import { computed } from 'vue'
import { useOpenSpecStore } from '../../../stores/openspec'

export function useEditMode() {
  const store = useOpenSpecStore()

  const editMode = computed({
    get: () => store.editMode,
    set: value => store.setEditMode(value)
  })

  const hasUnsavedChanges = computed({
    get: () => store.hasUnsavedChanges,
    set: value => store.setHasUnsavedChanges(value)
  })

  return {
    editMode,
    hasUnsavedChanges,
    setEditMode: store.setEditMode,
    setHasUnsavedChanges: store.setHasUnsavedChanges
  }
}
