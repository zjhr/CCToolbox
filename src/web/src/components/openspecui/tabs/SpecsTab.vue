<template>
  <div class="specs-tab" :class="{ 'specs-tab--detail': !!activeSpec }">
    <div v-if="!activeSpec" key="list">
      <div v-if="specItems.length === 0" class="empty">
        <n-empty description="暂无规范文件" />
      </div>
        <div v-else class="spec-list">
          <div
            v-for="item in specItems"
            :key="item.path"
            class="spec-card"
            :class="{ disabled: !item.filePath }"
            @click="openSpec(item)"
          >
            <div class="spec-info">
              <div class="spec-title">{{ item.name }}</div>
              <div class="spec-meta">
                {{ item.fileName || '未找到 spec.md' }}
                <span v-if="item.mtime"> · {{ formatTime(item.mtime) }}</span>
              </div>
            </div>
            <div class="spec-count">
              {{ requirementLabel(item) }}
            </div>
          </div>
        </div>
      </div>
    <Teleport v-else key="detail" to="body" :disabled="!isFullscreen">
      <div class="spec-detail" :class="{ 'spec-detail--fullscreen': isFullscreen }">
        <div class="detail-header">
          <div class="detail-header-left">
            <n-button size="small" type="primary" strong @click="closeSpec">返回</n-button>
            <div class="detail-title">{{ activeSpec.name }}</div>
          </div>
          <div class="detail-header-actions">
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
          </div>
        </div>
        <n-spin :show="loading" class="detail-spin">
            <MarkdownViewer
              :content="specContent"
              :editor-id="specEditorId"
              variant="spec"
              empty-text="未找到规范内容"
            />
        </n-spin>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, watch } from 'vue'
import { NButton, NEmpty, NIcon, NSpin } from 'naive-ui'
import { ContractOutline, ExpandOutline } from '@vicons/ionicons5'
import { useOpenSpecStore } from '../../../stores/openspec'
import { readFile as readFileApi } from '../../../api/openspec'
import MarkdownViewer from '../components/MarkdownViewer.vue'
import message from '../../../utils/message'

const store = useOpenSpecStore()
const activeSpec = ref(null)
const specContent = ref('')
const loading = ref(false)
const isFullscreen = ref(false)
const requirementCounts = ref({})
const requirementLoading = ref({})

const specItems = computed(() => {
  return (store.data.specs || [])
    .filter(node => node.type === 'directory' || node.type === 'file')
    .map(node => {
      if (node.type === 'file') {
        return {
          name: node.name,
          path: node.path,
          filePath: node.path,
          fileName: node.name,
          mtime: node.mtime
        }
      }
      const specFile = findSpecFile(node)
      return {
        name: node.name,
        path: node.path,
        filePath: specFile?.path || '',
        fileName: specFile?.name || '',
        mtime: node.mtime
      }
    })
})

const specEditorId = computed(() => {
  if (!activeSpec.value?.path) return 'openspec-spec'
  return `spec-${activeSpec.value.path.replace(/[^a-zA-Z0-9-_]/g, '_')}`
})

const fullscreenLabel = computed(() => {
  return isFullscreen.value ? '还原' : '放大'
})

const fullscreenIcon = computed(() => {
  return isFullscreen.value ? ContractOutline : ExpandOutline
})

const requirementLabel = computed(() => {
  return (item) => {
    if (!item?.filePath) return '未找到要求'
    if (requirementLoading.value[item.filePath]) return '加载中...'
    const count = requirementCounts.value[item.filePath]
    if (typeof count === 'number') return `${count} 项要求`
    return '加载中...'
  }
})

watch(
  () => store.projectPath,
  () => {
    requirementCounts.value = {}
    requirementLoading.value = {}
  }
)

watch(
  specItems,
  (items) => {
    if (!store.projectPath) return
    items.forEach((item) => {
      if (!item.filePath) return
      if (requirementCounts.value[item.filePath] != null) return
      if (requirementLoading.value[item.filePath]) return
      requirementLoading.value = { ...requirementLoading.value, [item.filePath]: true }
      readFileApi(store.projectPath, item.filePath)
        .then((result) => {
          const count = countRequirements(result?.content || '')
          requirementCounts.value = { ...requirementCounts.value, [item.filePath]: count }
        })
        .catch(() => {
          requirementCounts.value = { ...requirementCounts.value, [item.filePath]: 0 }
        })
        .finally(() => {
          requirementLoading.value = { ...requirementLoading.value, [item.filePath]: false }
        })
    })
  },
  { immediate: true }
)

async function openSpec(item) {
  if (!item?.filePath || !store.projectPath) {
    message.warning('未找到规范文件')
    return
  }
  loading.value = true
  try {
    const result = await readFileApi(store.projectPath, item.filePath)
    activeSpec.value = item
    specContent.value = result.content || ''
  } catch (err) {
    message.error('读取规范失败')
  } finally {
    loading.value = false
  }
}

async function closeSpec() {
  if (isFullscreen.value) {
    isFullscreen.value = false
    await nextTick()
  }
  activeSpec.value = null
  specContent.value = ''
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

function findSpecFile(node) {
  if (!node?.children) return null
  const direct = (node.children || []).find(child => child.type === 'file' && child.name === 'spec.md')
  if (direct) return direct
  for (const child of node.children || []) {
    if (child.type === 'directory') {
      const found = findSpecFile(child)
      if (found) return found
    }
  }
  return null
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

function countRequirements(content) {
  const text = String(content || '')
  const matches = text.match(/^#{2,4}\s+Requirement:/gm)
  return matches ? matches.length : 0
}
</script>

<style scoped>
.specs-tab {
  padding: 8px 4px;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.specs-tab.specs-tab--detail {
  overflow: hidden;
}

.spec-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.spec-card {
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

.spec-card:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.12);
}

.spec-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
  box-shadow: none;
}

.spec-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spec-title {
  font-size: 14px;
  font-weight: 600;
}

.spec-meta {
  font-size: 12px;
  color: #666;
}

.spec-count {
  font-size: 12px;
  color: #8a5a2f;
  padding: 4px 8px;
  border-radius: 999px;
  background: #fff4e6;
  border: 1px solid #f0d9bb;
  white-space: nowrap;
}

.spec-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 12px;
  overflow: hidden;
}

.spec-detail.spec-detail--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2001;
  border-radius: 0;
  border: none;
  box-sizing: border-box;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.detail-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.detail-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.detail-spin {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-spin :deep(.n-spin-container) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.detail-spin :deep(.n-spin-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}


</style>
