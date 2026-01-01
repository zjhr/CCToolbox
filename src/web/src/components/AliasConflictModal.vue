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
        <span>别名冲突</span>
      </div>
    </template>

    <div class="modal-body">
      <p class="hint-text">以下别名已被其他会话使用，请选择处理方式：</p>

      <div class="conflict-list">
        <div v-for="conflict in conflicts" :key="conflict.trashId" class="conflict-item">
          <span class="alias-name">别名 "{{ conflict.alias }}"</span>
          <n-text depth="3">冲突会话: {{ conflict.conflictSessionId }}</n-text>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="handleResolve('keep-existing')">保留当前列表中的别名</n-button>
        <n-button type="warning" @click="handleResolve('overwrite')">使用回收站会话的别名</n-button>
        <n-button type="error" @click="handleResolve('cancel')">取消恢复</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { computed } from 'vue'
import { NModal, NButton, NText, NIcon } from 'naive-ui'
import { WarningOutline } from '@vicons/ionicons5'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  conflicts: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'resolve'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

function handleResolve(strategy) {
  emit('resolve', strategy)
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

.conflict-list {
  border: 1px solid #f0f0f0;
  border-radius: 10px;
  padding: 10px;
  background: #fafafa;
}

.conflict-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
  border-bottom: 1px dashed #e0e0e0;
}

.conflict-item:last-child {
  border-bottom: none;
}

.alias-name {
  font-weight: 600;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
