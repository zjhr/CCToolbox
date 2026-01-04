<template>
  <n-popover
    v-if="hasUpdate"
    v-model:show="showPanel"
    trigger="click"
    placement="bottom-end"
    :show-arrow="true"
  >
    <template #trigger>
      <n-badge dot>
        <n-button quaternary circle class="update-trigger">
          <template #icon>
            <n-icon :size="18">
              <RefreshOutline />
            </n-icon>
          </template>
        </n-button>
      </n-badge>
    </template>

    <UpdatePanel
      :current="updateInfo?.current"
      :remote="updateInfo?.remote"
      :updating="isUpdating"
      :progress="updateProgress"
      @update="handleUpdate"
      @dismiss="handleDismiss"
    />
  </n-popover>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { NBadge, NButton, NIcon, NPopover } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import UpdatePanel from './UpdatePanel.vue'
import { useUpdateChecker } from '../composables/useUpdateChecker'

const showPanel = ref(false)

const {
  hasUpdate,
  updateInfo,
  isUpdating,
  updateProgress,
  startUpdate,
  checkUpdate
} = useUpdateChecker()

async function handleUpdate() {
  await startUpdate()
}

function handleDismiss() {
  showPanel.value = false
}

onMounted(() => {
  checkUpdate()
})
</script>

<style scoped>
.update-trigger {
  color: var(--text-primary);
}
</style>
