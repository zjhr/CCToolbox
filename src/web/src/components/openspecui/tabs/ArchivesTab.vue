<template>
  <div class="archives-tab" :class="{ 'archives-tab--detail': !!activeArchive }">
    <div v-if="!activeArchive" key="list">
      <div v-if="archives.length === 0" class="empty">
        <n-empty description="暂无归档" />
      </div>
      <div v-else class="archive-list">
        <div v-for="item in archives" :key="item.path" class="archive-card" @click="openArchive(item)">
          <div class="archive-info">
            <div class="archive-title">{{ archiveTitle(item) }}</div>
            <div class="archive-meta">{{ archiveSubtitle(item) }}</div>
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
import { computed, ref, watch } from 'vue'
import { NEmpty, NTag } from 'naive-ui'
import { useOpenSpecStore } from '../../../stores/openspec'
import { readFile as readFileApi } from '../../../api/openspec'
import ChangeDetail from '../components/ChangeDetail.vue'

const store = useOpenSpecStore()

const activeArchive = ref(null)
const archiveTitles = ref({})
const archiveLoading = ref({})

const archives = computed(() => {
  return (store.data.archives || []).filter(node => node.type === 'directory')
})

const archiveTitle = computed(() => {
  return (item) => {
    if (!item?.path) return item?.name || ''
    if (archiveLoading.value[item.path]) return '读取中...'
    return archiveTitles.value[item.path] || item.name
  }
})

const archiveSubtitle = computed(() => {
  return (item) => {
    if (!item) return ''
    const timeText = formatRelativeTime(item.mtime)
    if (!timeText) return item.name
    return `${item.name} ${timeText}创建`
  }
})

watch(
  () => store.projectPath,
  () => {
    archiveTitles.value = {}
    archiveLoading.value = {}
  }
)

watch(
  archives,
  (items) => {
    if (!store.projectPath) return
    items.forEach((item) => {
      if (!item?.path) return
      if (archiveTitles.value[item.path]) return
      if (archiveLoading.value[item.path]) return
      archiveLoading.value = { ...archiveLoading.value, [item.path]: true }
      const filePath = joinPath(item.path, 'proposal.md')
      readFileApi(store.projectPath, filePath)
        .then((result) => {
          const title = extractProposalTitle(result?.content || '')
          archiveTitles.value = { ...archiveTitles.value, [item.path]: title || item.name }
        })
        .catch(() => {
          archiveTitles.value = { ...archiveTitles.value, [item.path]: item.name }
        })
        .finally(() => {
          archiveLoading.value = { ...archiveLoading.value, [item.path]: false }
        })
    })
  },
  { immediate: true }
)

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

function formatRelativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}天前`
  if (diff < 30 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 604800000)}周前`
  return `${Math.floor(diff / 2592000000)}个月前`
}

function extractProposalTitle(content) {
  const line = String(content || '').split('\n').find(item => item.trim())
  if (!line) return ''
  const match = line.match(/^#\s*(.+)$/)
  return match ? match[1].trim() : line.trim()
}

function joinPath(base, file) {
  if (!base) return file
  return `${base.replace(/\/$/, '')}/${file}`
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
