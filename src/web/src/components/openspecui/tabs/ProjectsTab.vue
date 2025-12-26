<template>
  <div class="projects-tab">
    <div v-if="!activeFile" key="list">
      <div v-if="store.data.projects.length === 0" class="empty">
        <n-empty description="暂无 OpenSpec 项目文件" />
      </div>
      <div v-else class="file-list">
        <div v-for="file in store.data.projects" :key="file.path" class="file-card" @click="openFile(file.path)">
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">{{ formatSize(file.size) }} · {{ formatTime(file.mtime) }}</div>
          </div>
        </div>
      </div>
    </div>
    <div v-else key="editor" class="editor-view">
      <EditorPanel :show-back="true" :show-close="false" @back="closeEditor" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { NEmpty } from 'naive-ui'
import { useOpenSpecStore } from '../../../stores/openspec'
import EditorPanel from '../EditorPanel.vue'

const store = useOpenSpecStore()
const activeFile = ref('')

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(ts) {
  if (!ts) return '未知时间'
  return new Date(ts).toLocaleString()
}

async function openFile(filePath) {
  const result = await store.readFile(filePath)
  if (result) {
    activeFile.value = filePath
  }
}

function closeEditor() {
  activeFile.value = ''
  store.closeEditor()
}
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
  padding: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

</style>
