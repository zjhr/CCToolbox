<template>
  <div class="changes-tab" :class="{ 'changes-tab--detail': !!activeChange }">
    <div v-if="!activeChange" key="list">
      <SearchBar v-model="searchQuery" placeholder="搜索变更..." :loading="searchLoading" />
      <div v-if="changes.length === 0" class="empty">
        <n-empty description="暂无变更记录" />
      </div>
      <div v-else class="change-list">
        <div v-for="item in changes" :key="item.path" class="change-card" @click="openChange(item)">
          <div class="change-info">
            <div class="change-title" v-html="highlightText(item.name)" />
            <div v-if="searchQuery && snippetFor(item)" class="change-snippet" v-html="highlightText(snippetFor(item))" />
            <div class="change-meta">{{ formatTime(item.mtime) }}</div>
          </div>
          <div class="change-progress-slot">
            <TaskProgress
              class="change-progress"
              :percentage="progressFor(item).percentage"
              :done="progressFor(item).done"
              :total="progressFor(item).total"
            />
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
const activeChange = ref(null)
const changeContents = reactive({})
const changeLoading = reactive({})

const rawChanges = computed(() => {
  return (store.data.changes || []).filter(node => node.type === 'directory' && node.name !== 'archive')
})

const searchQuery = computed({
  get: () => store.searchQuery,
  set: value => store.setSearchQuery(value)
})

const changes = computed(() => {
  return filterBySearchQuery(rawChanges.value, searchQuery.value, {
    getSearchText: (item) => {
      return `${item.name} ${item.path} ${changeContents[item.path] || ''}`
    }
  })
})

const { loadProgress, getProgress } = useTaskProgress()
const searchLoading = computed(() => {
  if (!searchQuery.value) return false
  return Object.values(changeLoading).some(Boolean)
})

watch(
  () => changes.value,
  (items) => {
    items.forEach(item => loadProgress(item))
  },
  { immediate: true }
)

watch(
  [() => searchQuery.value, rawChanges],
  ([query, items]) => {
    if (!query) return
    items.forEach(item => loadChangeContent(item))
  },
  { immediate: true }
)

function progressFor(item) {
  return getProgress(item)
}

function snippetFor(item) {
  return getSearchSnippet(changeContents[item.path] || '', searchQuery.value)
}

function highlightText(text) {
  return highlightMatches(text, searchQuery.value)
}

async function loadChangeContent(item) {
  if (!store.projectPath || !item?.path) return
  if (changeContents[item.path] || changeLoading[item.path]) return
  changeLoading[item.path] = true
  const proposalPath = joinPath(item.path, 'proposal.md')
  const tasksPath = joinPath(item.path, 'tasks.md')
  const designPath = joinPath(item.path, 'design.md')
  try {
    const results = await Promise.allSettled([
      readFileApi(store.projectPath, proposalPath),
      readFileApi(store.projectPath, tasksPath),
      readFileApi(store.projectPath, designPath)
    ])
    const content = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value?.content || '')
      .join('\n')
    changeContents[item.path] = content
  } catch (err) {
    changeContents[item.path] = ''
  } finally {
    changeLoading[item.path] = false
  }
}

function joinPath(base, file) {
  if (!base) return file
  return `${base.replace(/\/$/, '')}/${file}`
}

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

.change-snippet {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.change-snippet :deep(.search-highlight),
.change-title :deep(.search-highlight) {
  background: #fde68a;
  color: #7a4a1f;
  padding: 0 2px;
  border-radius: 4px;
}

.change-progress-slot {
  flex: 1;
  display: flex;
  justify-content: center;
}

.change-progress {
  width: min(240px, 100%);
}

</style>
