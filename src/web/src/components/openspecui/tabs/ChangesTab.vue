<template>
  <div class="changes-tab" :class="{ 'changes-tab--detail': !!activeChange }">
    <div v-if="!activeChange" key="list">
      <div v-if="changes.length === 0" class="empty">
        <n-empty description="暂无变更记录" />
      </div>
      <div v-else class="change-list">
        <div v-for="item in changes" :key="item.path" class="change-card" @click="openChange(item)">
          <div class="change-info">
            <div class="change-title">{{ item.name }}</div>
            <div class="change-meta">{{ formatTime(item.mtime) }}</div>
          </div>
          <n-tag size="small" :bordered="false" type="info">变更</n-tag>
        </div>
      </div>
    </div>
    <ChangeDetail
      v-else
      key="detail"
      :entry="activeChange"
      @back="closeChange"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { NEmpty, NTag } from 'naive-ui'
import { useOpenSpecStore } from '../../../stores/openspec'
import ChangeDetail from '../components/ChangeDetail.vue'

const store = useOpenSpecStore()
const activeChange = ref(null)

const changes = computed(() => {
  return (store.data.changes || []).filter(node => node.type === 'directory' && node.name !== 'archive')
})

function openChange(item) {
  activeChange.value = item
}

function closeChange() {
  activeChange.value = null
  store.closeEditor()
}

function formatTime(ts) {
  if (!ts) return '未知时间'
  return new Date(ts).toLocaleString()
}
</script>

<style scoped>
.changes-tab {
  padding: 0;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.changes-tab.changes-tab--detail {
  overflow: hidden;
}

.change-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.change-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.change-card:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.12);
}

.change-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.change-title {
  font-size: 14px;
  font-weight: 600;
}

.change-meta {
  font-size: 12px;
  color: #666;
}

</style>
