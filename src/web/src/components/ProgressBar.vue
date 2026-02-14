<template>
  <div class="delete-progress">
    <div class="delete-progress__header">
      <div class="delete-progress__header-main">
        <n-text strong>
          正在删除 {{ completed }}/{{ total }} ({{ percentage }}%)
        </n-text>
        <n-text
          v-if="failedCount > 0"
          depth="3"
          class="delete-progress__failed-count"
        >
          失败 {{ failedCount }} 项
        </n-text>
      </div>
      <n-tag size="small" :type="tagType" :bordered="false">
        {{ statusLabel }}
      </n-tag>
    </div>

    <n-progress
      type="line"
      :percentage="percentage"
      :processing="isProcessing"
      :status="progressStatus"
      :show-indicator="true"
    />

    <n-alert
      v-if="isCompletedSuccess"
      type="success"
      :show-icon="false"
      class="delete-progress__result"
    >
      删除完成，已成功处理 {{ completed }} 个会话。
    </n-alert>

    <n-alert
      v-if="hasErrors"
      type="warning"
      class="delete-progress__result"
      title="部分会话删除失败"
    >
      <div class="delete-progress__errors">
        <div
          v-for="(item, index) in errorItems"
          :key="`${item.sessionId || 'unknown'}-${index}`"
          class="delete-progress__error-item"
        >
          <span>{{ item.sessionId || '未知会话' }}</span>
          <span>{{ item.error || '删除失败' }}</span>
        </div>
      </div>
    </n-alert>

    <div v-if="hasErrors" class="delete-progress__actions">
      <n-button
        data-testid="retry-failed-button"
        size="small"
        tertiary
        type="warning"
        @click="$emit('retry', failedSessionIds)"
      >
        重试失败项
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NAlert, NButton, NProgress, NTag, NText } from 'naive-ui'

const props = defineProps({
  progress: {
    type: Object,
    default: () => ({})
  },
  status: {
    type: String,
    default: 'idle'
  },
  error: {
    type: String,
    default: ''
  }
})

defineEmits(['retry'])

const completed = computed(() => Number(props.progress?.completed || 0))
const total = computed(() => Number(props.progress?.total || 0))
const percentage = computed(() => {
  const value = Number(props.progress?.percentage || 0)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
})
const errorItems = computed(() => {
  const list = props.progress?.errors
  return Array.isArray(list) ? list : []
})
const failedCount = computed(() => {
  if (errorItems.value.length > 0) {
    return errorItems.value.length
  }
  return props.error ? 1 : 0
})
const failedSessionIds = computed(() => errorItems.value.map(item => item.sessionId).filter(Boolean))
const hasErrors = computed(() => errorItems.value.length > 0 || Boolean(props.error))
const isProcessing = computed(() => ['connecting', 'running', 'reconnecting'].includes(props.status))
const isCompletedSuccess = computed(() => props.status === 'completed' && !hasErrors.value)
const progressStatus = computed(() => {
  if (hasErrors.value || props.status === 'failed' || props.status === 'error') return 'error'
  if (props.status === 'completed') return 'success'
  return 'default'
})
const statusLabel = computed(() => {
  if (props.status === 'reconnecting') return '重连中'
  if (props.status === 'connecting') return '连接中'
  if (props.status === 'completed') return '已完成'
  if (props.status === 'failed' || props.status === 'error') return '失败'
  return '进行中'
})
const tagType = computed(() => {
  if (props.status === 'completed') return 'success'
  if (props.status === 'failed' || props.status === 'error') return 'error'
  if (props.status === 'reconnecting') return 'warning'
  return 'info'
})
</script>

<style scoped>
.delete-progress {
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
}

.delete-progress__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 8px;
}

.delete-progress__header-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.delete-progress__failed-count {
  font-size: 12px;
}

.delete-progress__result {
  margin-top: 10px;
}

.delete-progress__errors {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.delete-progress__error-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.delete-progress__actions {
  margin-top: 8px;
}
</style>
