<template>
  <div class="timeline">
    <div v-if="changes.length === 0" class="empty">
      <n-empty description="暂无变更记录" />
    </div>
    <div v-else class="timeline-list">
      <div v-for="item in changes" :key="item.path" class="timeline-item">
        <div class="item-title">
          <span>{{ item.name }}</span>
          <n-tag size="small" :bordered="false" type="info">提案</n-tag>
        </div>
        <div class="item-meta">{{ formatTime(item.mtime) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NEmpty, NTag } from 'naive-ui'

const props = defineProps({
  nodes: {
    type: Array,
    default: () => []
  }
})

const changes = computed(() => {
  return (props.nodes || []).filter(node => node.type === 'directory' && node.name !== 'archive')
})

function formatTime(ts) {
  if (!ts) return '未知时间'
  return new Date(ts).toLocaleString()
}
</script>

<style scoped>
.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-item {
  padding: 12px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
}

.item-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
}

.item-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #666;
}
</style>
