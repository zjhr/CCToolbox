<template>
  <div class="archives-tab" :class="{ 'archives-tab--detail': !!activeArchive }">
    <div v-if="!activeArchive" key="list">
      <div v-if="archives.length === 0" class="empty">
        <n-empty description="暂无归档" />
      </div>
      <div v-else class="archive-list">
        <div v-for="item in archives" :key="item.path" class="archive-card" @click="openArchive(item)">
          <div class="archive-info">
            <div class="archive-title">{{ item.name }}</div>
            <div class="archive-meta">{{ formatTime(item.mtime) }}</div>
          </div>
          <n-tag size="small" :bordered="false" type="warning">归档</n-tag>
        </div>
      </div>
    </div>
    <ChangeDetail
      v-else
      key="detail"
      :entry="activeArchive"
      @back="closeArchive"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { NEmpty, NTag } from 'naive-ui'
import { useOpenSpecStore } from '../../../stores/openspec'
import ChangeDetail from '../components/ChangeDetail.vue'

const store = useOpenSpecStore()

const activeArchive = ref(null)

const archives = computed(() => {
  return (store.data.archives || []).filter(node => node.type === 'directory')
})

function openArchive(item) {
  activeArchive.value = item
}

function closeArchive() {
  activeArchive.value = null
  store.closeEditor()
}

function formatTime(ts) {
  if (!ts) return '未知时间'
  return new Date(ts).toLocaleString()
}
</script>

<style scoped>
.archives-tab {
  padding: 8px 4px;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.archives-tab.archives-tab--detail {
  overflow: hidden;
}

.archive-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.archive-card {
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

.archive-card:hover {
  border-color: #f0a020;
  box-shadow: 0 2px 8px rgba(240, 160, 32, 0.12);
}

.archive-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.archive-title {
  font-size: 14px;
  font-weight: 600;
}

.archive-meta {
  font-size: 12px;
  color: #666;
}

</style>
