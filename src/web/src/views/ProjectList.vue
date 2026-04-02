<template>
  <div class="project-list-container">
      <!-- Fixed Header -->
      <div class="header">
        <div class="header-text">
          <n-h2 style="margin: 0;">我的项目</n-h2>
          <n-text depth="3">选择一个项目查看会话</n-text>
        </div>
        <div class="header-actions">
          <n-select
            v-model:value="sortBy"
            :options="sortOptions"
            size="small"
            class="sort-select"
          />
          <n-input
            v-model:value="searchQuery"
            placeholder="搜索项目..."
            clearable
            class="search-input"
          >
            <template #prefix>
              <n-icon><SearchOutline /></n-icon>
            </template>
          </n-input>
        </div>
      </div>

      <!-- Scrollable Content -->
      <div class="content" ref="contentEl">
        <!-- Loading -->
        <div v-if="store.loading" class="loading-container">
        <n-spin size="large">
          <template #description>
            加载项目列表...
          </template>
        </n-spin>
      </div>

      <!-- Error -->
      <n-alert v-else-if="store.error" type="error" title="加载失败" style="margin-top: 20px;">
        {{ store.error }}
      </n-alert>

      <!-- Projects Grid (Sorted & Filtered) -->
      <div v-else class="projects-grid">
        <ProjectCard
          v-for="project in sortedAndFilteredProjects"
          :key="project.name"
          :project="project"
          @click="handleProjectClick(project.name)"
          @delete="handleDeleteProject"
        />
      </div>

      <!-- Empty State -->
      <n-empty
        v-if="!store.loading && !store.error && store.projects.length === 0"
        description="没有找到项目"
        style="margin-top: 60px;"
      >
        <template #icon>
          <n-icon><FolderOpenOutline /></n-icon>
        </template>
      </n-empty>
    </div>

    <!-- Global Search Shortcut Hint -->
    <div class="search-hint">
      <n-text depth="3" style="font-size: 12px;">
        <kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>K</kbd> 全局搜索
      </n-text>
    </div>

    <!-- Global Search Modal -->
    <SearchModal v-model:show="showGlobalSearch" :channel="currentChannel" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NH2, NText, NSpin, NAlert, NEmpty, NIcon, NInput, NSelect } from 'naive-ui'
import { FolderOpenOutline, SearchOutline } from '@vicons/ionicons5'
import { useSessionsStore } from '../stores/sessions'
import ProjectCard from '../components/ProjectCard.vue'
import SearchModal from '../components/SearchModal.vue'
import message, { dialog } from '../utils/message'

const router = useRouter()
const route = useRoute()
const store = useSessionsStore()

// 当前渠道
const currentChannel = computed(() => route.meta.channel || 'claude')

// Search query
const searchQuery = ref('')

// Sort options
const sortBy = ref('lastUsedDesc')
const sortOptions = [
  { label: '更新时间 ↓', value: 'lastUsedDesc' },
  { label: '更新时间 ↑', value: 'lastUsedAsc' },
  { label: '创建时间 ↓', value: 'createdAtDesc' },
  { label: '创建时间 ↑', value: 'createdAtAsc' },
  { label: '名称 A-Z', value: 'nameAsc' },
  { label: '名称 Z-A', value: 'nameDesc' }
]

// Content element ref for scroll preservation
const contentEl = ref(null)

// Global search
const showGlobalSearch = ref(false)

// Sorted and filtered projects
const sortedAndFilteredProjects = computed(() => {
  let list = [...store.projects]

  // Filter based on search
  const query = searchQuery.value.toLowerCase()
  if (query) {
    list = list.filter(project => {
      const displayName = (project.displayName || '').toLowerCase()
      const fullPath = (project.fullPath || '').toLowerCase()
      return displayName.includes(query) || fullPath.includes(query)
    })
  }

  // Sort
  return list.sort((a, b) => {
    switch (sortBy.value) {
      case 'lastUsedDesc':
        return (b.lastUsed || 0) - (a.lastUsed || 0)
      case 'lastUsedAsc':
        return (a.lastUsed || 0) - (b.lastUsed || 0)
      case 'createdAtDesc':
        return (b.createdAt || 0) - (a.createdAt || 0)
      case 'createdAtAsc':
        return (a.createdAt || 0) - (b.createdAt || 0)
      case 'nameAsc':
        return (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')
      case 'nameDesc':
        return (b.displayName || b.name || '').localeCompare(a.displayName || a.name || '')
      default:
        return 0
    }
  })
})

function handleProjectClick(projectName) {
  const channel = route.meta.channel || 'claude'
  router.push({ name: `${channel}-sessions`, params: { projectName } })
}

function handleDeleteProject(project) {
  // 使用解析后的完整路径
  const projectPath = project.fullPath || project.name
  const sessionCount = project.sessionCount || 0

  dialog.warning({
    title: '删除项目',
    content: `确定要删除项目 "${projectPath}" 吗？\n\n当前项目包含 ${sessionCount} 个会话，删除后所有会话数据将无法恢复！`,
    positiveText: '确定删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await store.deleteProject(project.name)
        message.success('项目已删除')
      } catch (err) {
        message.error('删除失败: ' + err.message)
      }
    }
  })
}

// 保存和恢复滚动位置
async function refreshDataWithScrollPreservation() {
  // Save scroll position
  const scrollTop = contentEl.value?.scrollTop || 0

  // Fetch data
  await store.fetchProjects()

  // Restore scroll position after DOM update
  await nextTick()
  if (contentEl.value) {
    contentEl.value.scrollTop = scrollTop
  }
}

// 快捷键监听
function handleKeyDown(e) {
  // Command/Ctrl + K
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    showGlobalSearch.value = true
  }
}

// 监听 channel 变化
watch(currentChannel, (newChannel) => {
  store.setChannel(newChannel)
  store.fetchProjects()
}, { immediate: true })

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.project-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.header {
  flex-shrink: 0;
  padding: 24px 24px 20px 24px;
  background: var(--gradient-bg);
  border-bottom: 1px solid var(--border-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  position: relative;
}

.header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(24, 160, 88, 0.1), transparent);
}

.header-text {
  flex: 1;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sort-select {
  width: 130px;
}

.header-text :deep(.n-h2) {
  font-size: 26px;
  font-weight: 700;
  background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

[data-theme="dark"] .header-text :deep(.n-h2) {
  background: linear-gradient(135deg, #f9fafb 0%, #d1d5db 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.search-input {
  width: 240px;
  flex-shrink: 0;
}

.search-input :deep(.n-input) {
  border-radius: 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  transition: all 0.2s ease;
}

.search-input :deep(.n-input:hover) {
  border-color: var(--border-secondary);
  box-shadow: var(--shadow-sm);
}

.search-input :deep(.n-input:focus-within) {
  border-color: #18a058;
  box-shadow: 0 0 0 3px rgba(24, 160, 88, 0.1);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 24px 24px;
  background: var(--gradient-bg);
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

/* 全局搜索快捷键提示 */
.search-hint {
  position: fixed;
  bottom: 24px;
  left: 24px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 10;
  backdrop-filter: blur(10px);
  opacity: 0.8;
  transition: all 0.2s ease;
}

[data-theme="dark"] .search-hint {
  background: rgba(30, 41, 59, 0.95);
  border: 1px solid rgba(71, 85, 105, 0.6);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.search-hint:hover {
  opacity: 1;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

[data-theme="dark"] .search-hint:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
}

.search-hint kbd {
  display: inline-block;
  padding: 4px 8px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  box-shadow: 0 2px 0 var(--border-primary), 0 1px 3px rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] .search-hint kbd {
  background: rgba(51, 65, 85, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.8);
  box-shadow: 0 2px 0 rgba(30, 41, 59, 0.8), 0 1px 4px rgba(0, 0, 0, 0.4);
  color: #e2e8f0;
}
</style>
