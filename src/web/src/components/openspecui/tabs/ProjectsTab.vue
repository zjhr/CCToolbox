<template>
  <div class="projects-tab">
    <div v-if="!activeFile" key="list">
      <div v-if="sortedProjects.length === 0" class="empty">
        <n-empty description="暂无 OpenSpec 项目文件" />
      </div>
      <div v-else class="file-list">
        <div v-for="file in sortedProjects" :key="file.path" class="file-card" @click="openFile(file.path)">
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">{{ formatSize(file.size) }} · {{ formatTime(file.mtime) }}</div>
          </div>
        </div>
      </div>
    </div>
    <Teleport v-else key="editor" to="body" :disabled="!isFullscreen">
      <div class="editor-view" :class="{ 'editor-view--fullscreen': isFullscreen }">
      <div class="editor-header">
        <div class="editor-header-left">
          <n-button size="small" type="primary" strong @click="handleBack">返回</n-button>
          <div class="editor-title">{{ activeFileName }}</div>
        </div>
        <div class="editor-header-actions">
          <n-button
            size="small"
            quaternary
            circle
            :title="fullscreenLabel"
            @click="toggleFullscreen"
          >
            <template #icon>
              <n-icon>
                <component :is="fullscreenIcon" />
              </n-icon>
            </template>
          </n-button>
          <EditModeToggle
            v-model:editMode="editMode"
            :has-unsaved-changes="hasUnsavedChanges"
            @save="handleSave"
            @cancel="handleCancel"
          />
        </div>
      </div>

      <ConflictResolver v-if="store.conflict" />

      <n-spin :show="fileLoading" class="editor-spin">
        <div class="editor-body">
          <MarkdownViewer
            v-if="!editMode"
            :content="previewContent"
            editor-id="openspec-project-preview"
            empty-text="暂无内容"
          />
          <MdEditor
            v-else
            v-model="draft"
            class="project-editor"
            :preview="false"
            :toolbars="toolbars"
          />
        </div>
      </n-spin>
    </div>
    </Teleport>

    <n-modal v-model:show="showExitConfirm" preset="dialog" title="退出编辑？">
      <div class="confirm-content">当前编辑内容尚未保存，确认退出吗？</div>
      <template #action>
        <n-button size="small" @click="showExitConfirm = false">继续编辑</n-button>
        <n-button size="small" type="warning" @click="confirmExit">退出编辑</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NEmpty, NIcon, NModal, NSpin } from 'naive-ui'
import { ContractOutline, ExpandOutline } from '@vicons/ionicons5'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useOpenSpecStore } from '../../../stores/openspec'
import { useOpenSpecEditor } from '../../../composables/useOpenSpecEditor'
import { useEditMode } from '../composables/useEditMode'
import ConflictResolver from '../components/ConflictResolver.vue'
import EditModeToggle from '../components/EditModeToggle.vue'
import MarkdownViewer from '../components/MarkdownViewer.vue'

const store = useOpenSpecStore()
const activeFile = ref('')
const fileLoading = ref(false)
const showExitConfirm = ref(false)
const isFullscreen = ref(false)

const { draft, dirty, save, resetDraft, clearTimers } = useOpenSpecEditor({
  autoSave: false
})
const { editMode, hasUnsavedChanges, setEditMode, setHasUnsavedChanges } = useEditMode()

const activeFileName = computed(() => {
  const match = store.data.projects.find(item => item.path === activeFile.value)
  return match?.name || activeFile.value
})

const previewContent = computed(() => {
  return store.currentFile?.content || ''
})

const sortedProjects = computed(() => {
  return sortByMtimeDesc(store.data.projects || [])
})

const fullscreenLabel = computed(() => {
  return isFullscreen.value ? '还原' : '放大'
})

const fullscreenIcon = computed(() => {
  return isFullscreen.value ? ContractOutline : ExpandOutline
})

const toolbars = [
  'bold',
  'italic',
  'strikeThrough',
  'title',
  'quote',
  'unorderedList',
  'orderedList',
  'link',
  'table',
  'preview'
]

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(ts) {
  if (!ts) return '未知时间'
  return new Date(ts).toLocaleString()
}

function sortByMtimeDesc(items) {
  return [...items].sort((a, b) => (b?.mtime || 0) - (a?.mtime || 0))
}

async function openFile(filePath) {
  fileLoading.value = true
  try {
    const result = await store.readFile(filePath)
    if (result) {
      activeFile.value = filePath
      setEditMode(false)
      setHasUnsavedChanges(false)
      resetDraft()
    }
  } finally {
    fileLoading.value = false
  }
}

function handleCancel() {
  resetDraft()
  setHasUnsavedChanges(false)
}

async function handleSave() {
  await save(false)
  if (!store.conflict) {
    setHasUnsavedChanges(false)
  }
}

function handleBack() {
  if (hasUnsavedChanges.value) {
    showExitConfirm.value = true
    return
  }
  closeEditor()
}

function confirmExit() {
  showExitConfirm.value = false
  resetDraft()
  setHasUnsavedChanges(false)
  closeEditor()
}

function closeEditor() {
  if (isFullscreen.value) {
    isFullscreen.value = false
  }
  activeFile.value = ''
  setEditMode(false)
  setHasUnsavedChanges(false)
  store.closeEditor()
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

watch(dirty, (value) => {
  setHasUnsavedChanges(value)
})

onBeforeUnmount(() => {
  clearTimers()
})
</script>

<style scoped>
.projects-tab {
  padding: 8px 4px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-card {
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

.file-card:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.12);
}

.file-name {
  font-size: 14px;
  font-weight: 600;
}

.file-meta {
  font-size: 12px;
  color: #666;
}

.editor-view {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 8px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-view.editor-view--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2030;
  padding: 16px;
  background: var(--bg-primary);
  box-sizing: border-box;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.editor-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.editor-title {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.editor-spin {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-spin :deep(.n-spin-container) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.editor-spin :deep(.n-spin-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 12px;
}

.project-editor {
  flex: 1;
  min-height: 0;
  display: flex;
}

.project-editor :deep(.md-editor) {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.project-editor :deep(.md-editor-content) {
  flex: 1;
  min-height: 0;
}

.confirm-content {
  margin: 8px 0 12px;
  color: #475569;
}

</style>
