<template>
  <div class="archives-tab" :class="{ 'archives-tab--detail': !!activeArchive }">
    <div v-if="!activeArchive" key="list">
      <SearchBar v-model="searchQuery" placeholder="搜索归档..." :loading="searchLoading" />
      <div v-if="archives.length === 0" class="empty">
        <n-empty description="暂无归档" />
      </div>
      <div v-else class="archive-list">
        <div v-for="item in archives" :key="item.path" class="archive-card" @click="openArchive(item)">
          <div class="archive-info">
            <div class="archive-title" v-html="highlightText(item.displayTitle)" />
            <div v-if="searchQuery && snippetFor(item)" class="archive-snippet" v-html="highlightText(snippetFor(item))" />
            <div class="archive-meta">{{ item.displaySubtitle }}</div>
          </div>
          <div class="archive-progress-slot">
            <TaskProgress
              class="archive-progress"
              :percentage="progressFor(item).percentage"
              :done="progressFor(item).done"
              :total="progressFor(item).total"
            />
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
import { computed, reactive, ref, watch } from 'vue'
import { NEmpty, NTag } from 'naive-ui'
import { useOpenSpecStore } from '../../../stores/openspec'
import { readFile as readFileApi } from '../../../api/openspec'
import ChangeDetail from '../components/ChangeDetail.vue'
import SearchBar from '../components/SearchBar.vue'
import TaskProgress from '../components/TaskProgress.vue'
import { filterBySearchQuery, getSearchSnippet, highlightMatches } from '../composables/useSearch'
import { useTaskProgress } from '../composables/useTaskProgress'

const store = useOpenSpecStore()

const activeArchive = ref(null)
const archiveTitles = ref({})
const archiveLoading = ref({})
const archiveContents = reactive({})
const archiveContentLoading = reactive({})

const rawArchives = computed(() => {
  const items = (store.data.archives || []).filter(node => node.type === 'directory')
  return sortByMtimeDesc(items)
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

const archiveItems = computed(() => {
  return rawArchives.value.map(item => ({
    ...item,
    displayTitle: archiveTitle.value(item),
    displaySubtitle: archiveSubtitle.value(item)
  }))
})

const searchQuery = computed({
  get: () => store.searchQuery,
  set: value => store.setSearchQuery(value)
})

const archives = computed(() => {
  return filterBySearchQuery(archiveItems.value, searchQuery.value, {
    getSearchText: (item) => {
      return `${item.displayTitle} ${item.displaySubtitle} ${item.path} ${item.name} ${archiveContents[item.path] || ''}`
    }
  })
})

const { loadProgress, getProgress } = useTaskProgress()
const searchLoading = computed(() => {
  if (!searchQuery.value) return false
  return Object.values(archiveContentLoading).some(Boolean)
})

watch(
  () => store.projectPath,
  () => {
    archiveTitles.value = {}
    archiveLoading.value = {}
  }
)

watch(
  rawArchives,
  (items) => {
    if (!store.projectPath) return
    items.forEach((item) => {
      if (!item?.path) return
      if (archiveTitles.value[item.path]) return
      if (archiveLoading.value[item.path]) return
      if (!hasChildFile(item, 'proposal.md')) {
        archiveTitles.value = { ...archiveTitles.value, [item.path]: item.name }
        return
      }
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

watch(
  () => archives.value,
  (items) => {
    items.forEach(item => loadProgress(item))
  },
  { immediate: true }
)

watch(
  [() => searchQuery.value, rawArchives],
  ([query, items]) => {
    if (!query) return
    items.forEach(item => loadArchiveContent(item))
  },
  { immediate: true }
)

function progressFor(item) {
  return getProgress(item)
}

function snippetFor(item) {
  return getSearchSnippet(archiveContents[item.path] || '', searchQuery.value)
}

function highlightText(text) {
  return highlightMatches(text, searchQuery.value)
}

function sortByMtimeDesc(items) {
  return [...items].sort((a, b) => (b?.mtime || 0) - (a?.mtime || 0))
}

function hasChildFile(item, fileName) {
  return (item?.children || []).some(child => child.type === 'file' && child.name === fileName)
}

function openArchive(item) {
  activeArchive.value = item
}

function closeArchive() {
  activeArchive.value = null
  store.closeEditor()
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

async function loadArchiveContent(item) {
  if (!store.projectPath || !item?.path) return
  if (archiveContents[item.path] || archiveContentLoading[item.path]) return
  const proposalPath = joinPath(item.path, 'proposal.md')
  const tasksPath = joinPath(item.path, 'tasks.md')
  const designPath = joinPath(item.path, 'design.md')
  const filePaths = [
    hasChildFile(item, 'proposal.md') ? proposalPath : '',
    hasChildFile(item, 'tasks.md') ? tasksPath : '',
    hasChildFile(item, 'design.md') ? designPath : ''
  ].filter(Boolean)
  if (filePaths.length === 0) {
    archiveContents[item.path] = ''
    return
  }
  archiveContentLoading[item.path] = true
  try {
    const results = await Promise.allSettled([
      ...filePaths.map(filePath => readFileApi(store.projectPath, filePath))
    ])
    const content = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value?.content || '')
      .join('\n')
    archiveContents[item.path] = content
  } catch (err) {
    archiveContents[item.path] = ''
  } finally {
    archiveContentLoading[item.path] = false
  }
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 1fr) auto;
  align-items: center;
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

.archive-snippet {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.archive-snippet :deep(.search-highlight),
.archive-title :deep(.search-highlight) {
  background: #fde68a;
  color: #7a4a1f;
  padding: 0 2px;
  border-radius: 4px;
}

.archive-progress-slot {
  display: flex;
  justify-content: center;
}

.archive-progress {
  width: min(240px, 100%);
}

</style>
