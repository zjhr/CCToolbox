<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :bordered="false"
    style="width: 760px; max-width: 92vw;"
  >
    <template #header>
      <div class="modal-header">
        <div class="title">
          <span>回收站</span>
          <n-tag size="small" :bordered="false" type="info" class="count-tag">
            {{ items.length }}
          </n-tag>
        </div>
        <div class="actions">
          <n-button
            size="small"
            secondary
            :disabled="selectedCount === 0"
            @click="handleRestoreSelected"
          >
            恢复选中 ({{ selectedCount }})
          </n-button>
          <n-button size="small" type="error" tertiary @click="handleEmpty">
            清空回收站
          </n-button>
        </div>
      </div>
    </template>

    <div class="toolbar">
      <n-checkbox
        :checked="allSelected"
        :indeterminate="indeterminate"
        @update:checked="toggleSelectAll"
      >
        全选
      </n-checkbox>
      <n-text depth="3" v-if="selectedCount > 0">已选 {{ selectedCount }} 项</n-text>
    </div>

    <div class="modal-body">
      <n-spin v-if="loading" size="large">
        <template #description>加载回收站...</template>
      </n-spin>
      <n-empty v-else-if="items.length === 0" description="回收站为空" />
      <div v-else class="trash-list">
        <div
          v-for="item in items"
          :key="item.trashId"
          class="trash-item"
          :class="{ selected: selectedIds.has(item.trashId) }"
        >
          <n-checkbox
            :checked="selectedIds.has(item.trashId)"
            @click.stop
            @update:checked="(val) => setSelection(item.trashId, val)"
          />
          <div class="item-content" @click="handleView(item.trashId)">
            <div class="item-title">
              <span class="session-name">
                {{ item.alias ? `${item.alias} (${item.sessionId.substring(0, 8)})` : item.sessionId }}
              </span>
              <n-tag v-if="isExpiringSoon(item)" size="small" type="warning" :bordered="false">
                即将过期
              </n-tag>
            </div>
            <div class="item-meta">
              <n-text depth="3">删除时间: {{ formatDate(item.deletedAt) }}</n-text>
              <n-text depth="3">•</n-text>
              <n-text depth="3">剩余: {{ formatRemaining(item.remainingTime) }}</n-text>
            </div>
            <n-text depth="3" class="item-message" v-if="item.firstMessage">
              {{ item.firstMessage }}
            </n-text>
          </div>
          <div class="item-actions">
            <n-button size="small" tertiary @click.stop="handleRestore([item.trashId])">
              恢复
            </n-button>
            <n-button size="small" tertiary @click.stop="handleView(item.trashId)">
              查看详情
            </n-button>
            <n-button size="small" type="error" tertiary @click.stop="handlePermanentDelete(item.trashId)">
              永久删除
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NButton, NTag, NCheckbox, NEmpty, NSpin, NText } from 'naive-ui'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  items: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'restore', 'permanent-delete', 'empty-trash', 'view'])

const selectedIds = ref(new Set())

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const selectedCount = computed(() => selectedIds.value.size)
const allSelected = computed(() => props.items.length > 0 && selectedIds.value.size === props.items.length)
const indeterminate = computed(() => selectedIds.value.size > 0 && selectedIds.value.size < props.items.length)

watch(() => props.visible, (val) => {
  if (!val) {
    selectedIds.value = new Set()
  }
})

watch(() => props.items, () => {
  const valid = new Set(props.items.map(item => item.trashId))
  selectedIds.value = new Set([...selectedIds.value].filter(id => valid.has(id)))
})

function toggleSelection(trashId) {
  const next = new Set(selectedIds.value)
  if (next.has(trashId)) {
    next.delete(trashId)
  } else {
    next.add(trashId)
  }
  selectedIds.value = next
}

function setSelection(trashId, checked) {
  const next = new Set(selectedIds.value)
  if (checked) {
    next.add(trashId)
  } else {
    next.delete(trashId)
  }
  selectedIds.value = next
}

function toggleSelectAll(checked) {
  if (checked) {
    selectedIds.value = new Set(props.items.map(item => item.trashId))
  } else {
    selectedIds.value = new Set()
  }
}

function handleRestoreSelected() {
  if (selectedIds.value.size === 0) return
  emit('restore', Array.from(selectedIds.value))
}

function handleRestore(trashIds) {
  emit('restore', trashIds)
}

function handlePermanentDelete(trashId) {
  emit('permanent-delete', trashId)
}

function handleView(trashId) {
  emit('view', trashId)
}

function handleEmpty() {
  emit('empty-trash')
}

function formatDate(timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString()
}

function formatRemaining(ms) {
  if (!ms || ms <= 0) return '已过期'
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))

  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分钟`
  return `${minutes}分钟`
}

function isExpiringSoon(item) {
  return item.remainingTime > 0 && item.remainingTime < 24 * 60 * 60 * 1000
}
</script>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.modal-header .title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.count-tag {
  margin-left: 4px;
}

.actions {
  display: flex;
  gap: 8px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.modal-body {
  min-height: 120px;
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}

.trash-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #e8e8e8;
  background: #fff;
  transition: background 0.2s ease;
  cursor: default;
}

.trash-item.selected {
  background: #f6f8ff;
  border-color: #d8e0ff;
}

.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}

.item-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.item-message {
  font-size: 12px;
  color: #666;
}

.item-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (max-width: 720px) {
  .trash-item {
    flex-direction: column;
  }
  .item-actions {
    flex-direction: row;
  }
}
</style>
