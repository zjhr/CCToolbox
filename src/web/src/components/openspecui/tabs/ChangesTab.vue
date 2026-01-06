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
          <div class="change-actions">
            <n-tag size="small" :bordered="false" type="info">变更</n-tag>
            <n-button
              v-if="canDelete(item)"
              size="small"
              quaternary
              circle
              type="error"
              class="change-delete-button"
              title="删除变更"
              aria-label="删除变更"
              :disabled="deleting"
              @click.stop="promptDelete(item)"
            >
              <template #icon>
                <n-icon :component="TrashOutline" />
              </template>
            </n-button>
          </div>
        </div>
      </div>
    </div>
    <ChangeDetail
      v-else
      key="detail"
      :entry="activeChange"
      @back="closeChange"
    />

    <n-modal v-model:show="showDeleteConfirm" preset="dialog" title="删除变更？">
      <div class="confirm-content">
        确认删除变更「{{ pendingDelete?.name || '' }}」吗？删除后无法恢复。
      </div>
      <template #action>
        <n-button size="small" @click="cancelDelete">取消</n-button>
        <n-button size="small" type="error" :loading="deleting" @click="confirmDelete">确认删除</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { NButton, NEmpty, NIcon, NModal, NTag } from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
import { useOpenSpecStore } from '../../../stores/openspec'
import { readFile as readFileApi } from '../../../api/openspec'
import ChangeDetail from '../components/ChangeDetail.vue'
import SearchBar from '../components/SearchBar.vue'
import TaskProgress from '../components/TaskProgress.vue'
import { filterBySearchQuery, getSearchSnippet, highlightMatches } from '../composables/useSearch'
import { useTaskProgress } from '../composables/useTaskProgress'
import message from '../../../utils/message'

const store = useOpenSpecStore()
const activeChange = ref(null)
const changeContents = reactive({})
const changeLoading = reactive({})
const showDeleteConfirm = ref(false)
const pendingDelete = ref(null)
const deleting = ref(false)

const rawChanges = computed(() => {
  const items = (store.data.changes || [])
    .filter(node => node.type === 'directory' && node.name !== 'archive')
  return sortByMtimeDesc(items)
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

function hasChildFile(item, fileName) {
  return (item?.children || []).some(child => child.type === 'file' && child.name === fileName)
}

function canDelete(item) {
  return hasChildFile(item, 'proposal.md')
}

function sortByMtimeDesc(items) {
  return [...items].sort((a, b) => (b?.mtime || 0) - (a?.mtime || 0))
}

async function loadChangeContent(item) {
  if (!store.projectPath || !item?.path) return
  if (changeContents[item.path] || changeLoading[item.path]) return
  const proposalPath = joinPath(item.path, 'proposal.md')
  const tasksPath = joinPath(item.path, 'tasks.md')
  const designPath = joinPath(item.path, 'design.md')
  const filePaths = [
    hasChildFile(item, 'proposal.md') ? proposalPath : '',
    hasChildFile(item, 'tasks.md') ? tasksPath : '',
    hasChildFile(item, 'design.md') ? designPath : ''
  ].filter(Boolean)
  if (filePaths.length === 0) {
    changeContents[item.path] = ''
    return
  }
  changeLoading[item.path] = true
  try {
    const results = await Promise.allSettled([
      ...filePaths.map(filePath => readFileApi(store.projectPath, filePath))
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

function promptDelete(item) {
  if (!item?.path) return
  pendingDelete.value = item
  showDeleteConfirm.value = true
}

function cancelDelete() {
  if (deleting.value) return
  showDeleteConfirm.value = false
  pendingDelete.value = null
}

async function confirmDelete() {
  if (!pendingDelete.value?.path || deleting.value) return
  deleting.value = true
  try {
    await store.deleteChange(pendingDelete.value.path)
    delete changeContents[pendingDelete.value.path]
    delete changeLoading[pendingDelete.value.path]
    message.success('变更已删除')
    showDeleteConfirm.value = false
    pendingDelete.value = null
  } catch (err) {
    const errorMsg = err?.response?.data?.error || err?.message || '删除失败'
    message.error(`删除失败: ${errorMsg}`)
  } finally {
    deleting.value = false
  }
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

.change-card:hover .change-delete-button,
.change-card:focus-within .change-delete-button {
  opacity: 1;
  pointer-events: auto;
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

.change-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.change-delete-button {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

@media (hover: none) {
  .change-delete-button {
    opacity: 1;
    pointer-events: auto;
  }
}

.confirm-content {
  margin: 8px 0 12px;
  color: #475569;
}

</style>
