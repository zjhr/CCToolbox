<template>
  <Teleport to="body" :disabled="!isFullscreen">
    <div class="change-detail" :class="{ 'change-detail--fullscreen': isFullscreen }">
      <div class="detail-header">
        <div class="detail-header-left">
          <n-button size="small" type="primary" strong @click="handleBack">返回</n-button>
          <div class="detail-title">{{ entry?.name || '未选择变更' }}</div>
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

      <n-tabs v-model:value="activeTab" placement="left" size="small" type="line" class="detail-tabs">
        <n-tab-pane name="overview" tab="概述">
          <n-spin :show="overviewLoading" class="overview-spin">
            <MarkdownViewer
              :content="overviewContent"
              :editor-id="overviewEditorId"
              empty-text="未找到概述内容"
            />
          </n-spin>
        </n-tab-pane>
        <n-tab-pane name="tasks" :tab="tasksLabel">
          <div class="tasks-panel">
            <div v-if="tasksLoading" class="tasks-loading">
              <n-text depth="3">任务加载中...</n-text>
            </div>
            <div v-else-if="tasks.length === 0" class="tasks-empty">
              <n-empty description="未找到 tasks.md 或暂无任务" />
            </div>
            <div v-else class="tasks-list">
              <div
                v-for="(entry, index) in taskEntries"
                :key="`${entry.type}-${entry.type === 'group' ? entry.title : entry.item.line}-${index}`"
                :style="{ marginLeft: `${getEntryIndent(entry) * 12}px` }"
                :class="entry.type === 'group' ? 'task-group' : 'task-item'"
              >
                <div v-if="entry.type === 'group'" class="task-group-title">
                  {{ entry.title }}
                </div>
                <n-checkbox
                  v-else
                  :checked="entry.item.checked"
                  @update:checked="(checked) => toggleTask(entry.item, checked)"
                >
                  {{ entry.item.text }}
                </n-checkbox>
              </div>
            </div>
          </div>
        </n-tab-pane>
        <n-tab-pane name="files" tab="文件夹">
          <div class="folder-panel">
            <div class="folder-editor">
              <div v-if="!activeFilePath" class="folder-empty">
                <n-empty description="选择一个 Markdown 文件进行编辑" />
              </div>
              <EditorPanel
                v-else
                :show-back="false"
                :show-close="false"
              />
            </div>
            <div class="folder-tree">
              <FileTree
                :nodes="entry?.children || []"
                :selected-path="activeFilePath"
                @select="handleFileSelect"
              />
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { NButton, NIcon, NTabs, NTabPane, NSpin, NEmpty, NCheckbox, NText } from 'naive-ui'
import { ContractOutline, ExpandOutline } from '@vicons/ionicons5'
import { useOpenSpecStore } from '../../../stores/openspec'
import { readFile as readFileApi, writeFile as writeFileApi } from '../../../api/openspec'
import MarkdownViewer from './MarkdownViewer.vue'
import FileTree from './FileTree.vue'
import EditorPanel from '../EditorPanel.vue'
import message from '../../../utils/message'

const props = defineProps({
  entry: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['back'])
const store = useOpenSpecStore()

const activeTab = ref('overview')
const overviewContent = ref('')
const overviewLoading = ref(false)
const tasksLoading = ref(false)
const tasks = ref([])
const taskEntries = ref([])
const taskLines = ref([])
const tasksPath = ref('')
const tasksEtag = ref('')
const activeFilePath = ref('')
const isFullscreen = ref(false)

const overviewEditorId = computed(() => {
  if (!props.entry?.path) return 'openspec-overview'
  return `change-${props.entry.path.replace(/[^a-zA-Z0-9-_]/g, '_')}`
})

const tasksLabel = computed(() => {
  const total = tasks.value.length
  const done = tasks.value.filter(item => item.checked).length
  return `任务(${done}/${total})`
})

const fullscreenLabel = computed(() => {
  return isFullscreen.value ? '还原' : '放大'
})

const fullscreenIcon = computed(() => {
  return isFullscreen.value ? ContractOutline : ExpandOutline
})


watch(
  () => activeTab.value,
  (tab) => {
    if (tab === 'files') {
      openFirstMarkdown()
    }
  }
)

watch(
  () => props.entry?.path,
  async (newPath) => {
    if (!newPath || !store.projectPath) return
    activeTab.value = 'overview'
    overviewContent.value = ''
    tasks.value = []
    taskLines.value = []
    tasksPath.value = ''
    tasksEtag.value = ''
    activeFilePath.value = ''
    store.closeEditor()
    await Promise.all([loadOverview(), loadTasks()])
  },
  { immediate: true }
)

// 监听详情页刷新触发器，当文件被外部修改时重新加载
watch(
  () => store.detailRefreshKey,
  async () => {
    if (!props.entry?.path || !store.projectPath) return
    // 静默刷新，不改变当前标签和滚动位置
    await Promise.all([loadOverview(), loadTasks()])
  }
)

async function loadOverview() {
  if (!props.entry?.path || !store.projectPath) return
  overviewLoading.value = true
  try {
    const designPath = joinPath(props.entry.path, 'design.md')
    const proposalPath = joinPath(props.entry.path, 'proposal.md')
    const [designResult, proposalResult] = await Promise.allSettled([
      readFileApi(store.projectPath, designPath),
      readFileApi(store.projectPath, proposalPath)
    ])
    const sections = []
    if (designResult.status === 'fulfilled' && designResult.value?.content) {
      sections.push(`## design.md\n\n${designResult.value.content}`)
    }
    if (proposalResult.status === 'fulfilled' && proposalResult.value?.content) {
      sections.push(`## proposal.md\n\n${proposalResult.value.content}`)
    }
    overviewContent.value = sections.join('\n\n---\n\n')
  } catch (err) {
    overviewContent.value = ''
  } finally {
    overviewLoading.value = false
  }
}

async function loadTasks() {
  if (!props.entry?.path || !store.projectPath) return
  const filePath = joinPath(props.entry.path, 'tasks.md')
  tasksLoading.value = true
  try {
    const result = await readFileApi(store.projectPath, filePath)
    tasksPath.value = filePath
    tasksEtag.value = result.etag || ''
    const parsed = parseTasks(result.content || '')
    tasks.value = parsed.items
    taskEntries.value = parsed.entries
    taskLines.value = parsed.lines
  } catch (err) {
    tasks.value = []
    taskEntries.value = []
    taskLines.value = []
    tasksPath.value = ''
    tasksEtag.value = ''
  } finally {
    tasksLoading.value = false
  }
}

async function toggleTask(task, checked) {
  if (!tasksPath.value || !store.projectPath) return
  const lines = taskLines.value.slice()
  const previousChecked = task.checked
  task.checked = checked
  tasks.value = [...tasks.value]
  taskEntries.value = [...taskEntries.value]
  const newLine = `${task.prefix}${checked ? 'x' : ' '}${task.suffix}${task.text}`
  lines[task.line] = newLine
  try {
    const result = await writeFileApi(store.projectPath, tasksPath.value, lines.join('\n'), tasksEtag.value)
    tasksEtag.value = result.etag || tasksEtag.value
    const parsed = parseTasks(result.content || lines.join('\n'))
    tasks.value = parsed.items
    taskEntries.value = parsed.entries
    taskLines.value = parsed.lines
  } catch (err) {
    task.checked = previousChecked
    tasks.value = [...tasks.value]
    taskEntries.value = [...taskEntries.value]
    message.error('同步任务状态失败')
  }
}

async function handleFileSelect(node) {
  if (node.type !== 'file') return
  if (!node.name.endsWith('.md')) {
    message.warning('仅支持编辑 Markdown 文件')
    return
  }
  const result = await store.readFile(node.path)
  if (result) {
    activeFilePath.value = node.path
  }
}

function closeEditor() {
  activeFilePath.value = ''
  store.closeEditor()
}

async function handleBack() {
  if (isFullscreen.value) {
    isFullscreen.value = false
    await nextTick()
  }
  closeEditor()
  emit('back')
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

function parseTasks(content) {
  const lines = String(content || '').split('\n')
  const items = []
  const root = { level: 0, entries: [] }
  const stack = [root]

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      if (title) {
        while (stack.length && stack[stack.length - 1].level >= level) {
          stack.pop()
        }
        const group = { title, level, entries: [] }
        stack[stack.length - 1].entries.push({ type: 'group', node: group })
        stack.push(group)
      }
      return
    }
    const match = line.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/)
    if (!match) return
    const indentSpaces = (match[1].match(/^\s*/) || [''])[0].length
    const item = {
      line: index,
      checked: match[2].toLowerCase() === 'x',
      text: match[4],
      prefix: match[1],
      suffix: match[3],
      indent: Math.floor(indentSpaces / 2)
    }
    items.push(item)
    stack[stack.length - 1].entries.push({ type: 'task', item })
  })
  return { lines, items, entries: flattenEntries(root.entries) }
}

function flattenEntries(entries, depth = 0, output = []) {
  entries.forEach((entry) => {
    if (entry.type === 'group') {
      output.push({ type: 'group', title: entry.node.title, depth })
      flattenEntries(entry.node.entries, depth + 1, output)
    } else {
      output.push({ type: 'task', item: entry.item, depth })
    }
  })
  return output
}

function getEntryIndent(entry) {
  if (entry.type === 'group') return entry.depth
  return entry.depth + (entry.item?.indent || 0)
}

function joinPath(base, file) {
  if (!base) return file
  return `${base.replace(/\/$/, '')}/${file}`
}

async function openFirstMarkdown() {
  if (!props.entry?.children || !store.projectPath) return
  if (activeFilePath.value) return
  const first = findFirstMarkdown(props.entry.children)
  if (!first) return
  const result = await store.readFile(first.path)
  if (result) {
    activeFilePath.value = first.path
  }
}

function findFirstMarkdown(nodes) {
  for (const node of nodes || []) {
    if (node.type === 'file' && node.name.endsWith('.md')) {
      return node
    }
  }
  for (const node of nodes || []) {
    if (node.type === 'directory') {
      const found = findFirstMarkdown(node.children || [])
      if (found) return found
    }
  }
  return null
}
</script>

<style scoped>
.change-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 12px;
}

.change-detail.change-detail--fullscreen {
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
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-tabs {
  flex: 1;
  min-height: 0;
}

.detail-tabs :deep(.n-tabs-nav) {
  min-width: 140px;
  position: sticky;
  top: 0;
  align-self: flex-start;
}

.detail-tabs :deep(.n-tabs-content),
.detail-tabs :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.detail-tabs :deep(.n-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.overview-spin {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.overview-spin :deep(.n-spin-container) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.overview-spin :deep(.n-spin-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tasks-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.tasks-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 8px 16px;
  box-sizing: border-box;
}

.task-item {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-primary);
  background: #fff;
}

.task-group {
  padding: 4px 8px;
}

.task-group-title {
  font-size: 13px;
  font-weight: 600;
  color: #7a4a1f;
  padding-left: 8px;
  border-left: 3px solid #d6863c;
  line-height: 1.6;
}

.folder-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.folder-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  height: 100%;
  flex: 1;
}

.folder-tree {
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 8px;
  overflow: auto;
  height: 100%;
}

.folder-empty,
.tasks-empty,
.tasks-loading {
  flex: 1;
  padding: 12px;
}
</style>
