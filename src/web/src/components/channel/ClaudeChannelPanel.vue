<template>
  <BaseChannelPanel ref="baseRef" type="claude" @open-website="url => emit('open-website', url)" />
</template>

<script setup>
import { ref } from 'vue'
import BaseChannelPanel from './BaseChannelPanel.vue'

const emit = defineEmits(['open-website'])
const baseRef = ref(null)

defineExpose({
  openAddDialog: () => baseRef.value?.openAddDialog(),
  refresh: () => baseRef.value?.refresh(),
  toggleAllCollapse: () => baseRef.value?.toggleAllCollapse(),
  getActiveChannel: () => baseRef.value?.getActiveChannel?.(),
  openActiveWebsite: () => baseRef.value?.openActiveWebsite?.(),
  editActiveChannel: () => baseRef.value?.editActiveChannel?.(),
  supportsReasoningEffort: () => baseRef.value?.supportsReasoningEffort?.(),
  getReasoningEffort: () => baseRef.value?.getReasoningEffort?.(),
  getReasoningEffortOptions: () => baseRef.value?.getReasoningEffortOptions?.(),
  setReasoningEffort: (value) => baseRef.value?.setReasoningEffort?.(value),
  isReasoningEffortSaving: () => baseRef.value?.isReasoningEffortSaving?.()
})
</script>
