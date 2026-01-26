<template>
  <n-drawer
    v-model:show="visible"
    :width="drawerWidth"
    placement="right"
    :mask-closable="true"
  >
    <n-drawer-content :show-header="false" closable>
      <SkillsPanel @back="visible = false" />
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { computed } from 'vue'
import { NDrawer, NDrawerContent } from 'naive-ui'
import SkillsPanel from './SkillsPanel.vue'
import { useResponsiveDrawer } from '../composables/useResponsiveDrawer'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible'])

const { drawerWidth } = useResponsiveDrawer(520)

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})
</script>
