<template>
  <div class="stat-cards">
    <div class="stat-card">
      <div class="stat-label">规范数量</div>
      <div class="stat-value">{{ stats?.specCount ?? 0 }}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">变更提案</div>
      <div class="stat-value">{{ stats?.changeCount ?? 0 }}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">已归档</div>
      <div class="stat-value">{{ stats?.archiveCount ?? 0 }}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">最近更新</div>
      <div class="stat-value">{{ lastUpdatedText }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({})
  }
})

const lastUpdatedText = computed(() => {
  const ts = props.stats?.lastUpdated
  if (!ts) return '暂无'
  const date = new Date(ts)
  return date.toLocaleString()
})
</script>

<style scoped>
.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 12px;
}

.stat-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}
</style>
