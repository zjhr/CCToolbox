<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :bordered="false"
    style="width: 560px; max-width: 92vw;"
  >
    <template #header>
      <div class="modal-header">
        <n-icon class="warning-icon" :size="20">
          <WarningOutline />
        </n-icon>
        <span>删除确认</span>
      </div>
    </template>

    <div class="modal-body">
      <p class="hint-text">确定要删除 {{ sessions.length }} 个会话吗？</p>
      <n-alert type="warning" :bordered="false" class="warning-box">
        删除的会话将移至回收站，可在 7 天内恢复。
      </n-alert>

      <div class="session-list">
        <div v-for="session in sessions" :key="session.sessionId" class="session-item">
          <span class="session-name">
            {{ session.alias ? `${session.alias} (${session.sessionId.substring(0, 8)})` : session.sessionId }}
          </span>
          <n-text depth="3">{{ formatSize(session.size) }}</n-text>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="handleCancel">取消</n-button>
        <n-button type="error" @click="handleConfirm">确定删除</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { computed } from 'vue'
import { NModal, NButton, NAlert, NText, NIcon } from 'naive-ui'
import { WarningOutline } from '@vicons/ionicons5'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  sessions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'confirm', 'cancel'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

function handleCancel() {
  emit('cancel')
  visible.value = false
}

function handleConfirm() {
  emit('confirm')
}

function formatSize(bytes) {
  if (!bytes) return '0B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)}${units[unitIndex]}`
}
</script>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.warning-icon {
  color: #f0a020;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint-text {
  margin: 0;
  font-size: 14px;
}

.warning-box {
  font-size: 13px;
}

.session-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #f0f0f0;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fafafa;
}

.session-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed #e0e0e0;
}

.session-item:last-child {
  border-bottom: none;
}

.session-name {
  font-weight: 500;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
