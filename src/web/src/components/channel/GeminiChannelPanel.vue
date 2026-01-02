<template>
  <BaseChannelPanel
    ref="baseRef"
    type="gemini"
    @open-website="url => emit('open-website', url)"
    @clear-config-state="value => emit('clear-config-state', value)"
  />
</template>

<script setup>
import { ref } from 'vue'
import BaseChannelPanel from './BaseChannelPanel.vue'

const emit = defineEmits(['open-website', 'clear-config-state'])
const baseRef = ref(null)

defineExpose({
  openAddDialog: () => baseRef.value?.openAddDialog(),
  refresh: () => baseRef.value?.refresh(),
  toggleAllCollapse: () => baseRef.value?.toggleAllCollapse(),
  clearConfig: () => baseRef.value?.clearConfig(),
  canClearConfig: () => baseRef.value?.canClearConfig?.()
})
</script>
