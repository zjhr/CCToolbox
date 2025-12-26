<template>
  <Teleport to="body" :disabled="!isFullscreen">
    <div class="editor-panel" :class="{ 'editor-panel--fullscreen': isFullscreen }">
      <div class="editor-header">
        <div class="file-info">
          <n-button v-if="showBack" size="small" type="primary" strong @click="handleBack">
            {{ backText }}
          </n-button>
          <span class="file-path">{{ store.currentFile?.path || '未选择文件' }}</span>
          <n-tag v-if="store.currentFile?.isLarge" size="small" :bordered="false" type="warning">
            大文件
          </n-tag>
          <n-tag v-if="dirty" size="small" :bordered="false" type="error">
            未保存
          </n-tag>
        </div>
        <div class="editor-actions">
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
          <n-text depth="3" v-if="saving">保存中...</n-text>
          <n-button size="small" type="primary" @click="save" :loading="saving">保存</n-button>
          <n-button v-if="showClose" size="small" quaternary @click="handleClose">关闭</n-button>
        </div>
      </div>

      <ConflictResolver v-if="store.conflict" />

      <MdEditor
        v-model="draft"
        class="editor-body"
        :preview="false"
        :toolbars="toolbars"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, nextTick } from 'vue'
import { NButton, NIcon, NTag, NText } from 'naive-ui'
import { ContractOutline, ExpandOutline } from '@vicons/ionicons5'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useOpenSpecStore } from '../../stores/openspec'
import { useOpenSpecEditor } from '../../composables/useOpenSpecEditor'
import ConflictResolver from './components/ConflictResolver.vue'

const store = useOpenSpecStore()
const emit = defineEmits(['back', 'close'])
const props = defineProps({
  showBack: {
    type: Boolean,
    default: false
  },
  backText: {
    type: String,
    default: '返回'
  },
  showClose: {
    type: Boolean,
    default: true
  }
})
const { draft, saving, dirty, save, closeEditor, clearTimers } = useOpenSpecEditor()
const isFullscreen = ref(false)

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

onBeforeUnmount(() => {
  clearTimers()
})

async function handleBack() {
  if (isFullscreen.value) {
    isFullscreen.value = false
    await nextTick()
  }
  closeEditor()
  emit('back')
}

async function handleClose() {
  if (isFullscreen.value) {
    isFullscreen.value = false
    await nextTick()
  }
  closeEditor()
  emit('close')
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}
</script>

<style scoped>
.editor-panel {
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 12px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.editor-panel.editor-panel--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2001;
  border-radius: 0;
  border: none;
  box-sizing: border-box;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  flex: 1;
  min-width: 0;
}

.file-path {
  color: #334155;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.editor-body {
  margin-top: 8px;
  flex: 1;
  min-height: 0;
  display: flex;
}

.editor-body :deep(.md-editor) {
  flex: 1;
  height: 100%;
  min-height: 0;
}

.editor-body :deep(.md-editor-content) {
  flex: 1;
  min-height: 0;
}
</style>
