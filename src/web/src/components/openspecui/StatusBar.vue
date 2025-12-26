<template>
  <div class="status-bar">
    <div class="status-left">同步状态：{{ statusText }}</div>
    <div class="status-right">最后更新：{{ timeText }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  syncStatus: {
    type: String,
    default: 'idle'
  },
  lastUpdated: {
    type: [Number, String],
    default: null
  }
})

const statusText = computed(() => {
  if (props.syncStatus === 'syncing') return '同步中'
  if (props.syncStatus === 'conflict') return '存在冲突'
  if (props.syncStatus === 'error') return '同步失败'
  if (props.syncStatus === 'synced') return '已同步'
  return '待同步'
})

const timeText = computed(() => {
  if (!props.lastUpdated) return '暂无'
  const date = new Date(props.lastUpdated)
  return date.toLocaleString()
})
</script>

<style scoped>
.status-bar {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 12px;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
