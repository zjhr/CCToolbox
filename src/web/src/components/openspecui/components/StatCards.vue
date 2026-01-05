<template>
  <div class="stat-cards">
    <div class="stat-card">
      <div class="stat-card-title">
        <n-icon :size="18" class="stat-icon">
          <DocumentTextOutline />
        </n-icon>
        <span>规范</span>
      </div>
      <div class="stat-value">{{ specCount }}</div>
      <div class="stat-subtext">{{ requirementsText }}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">
        <n-icon :size="18" class="stat-icon">
          <GitBranchOutline />
        </n-icon>
        <span>进行中</span>
      </div>
      <div class="stat-value">{{ changeCount }}</div>
      <div class="stat-subtext">进行中</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">
        <n-icon :size="18" class="stat-icon">
          <ArchiveOutline />
        </n-icon>
        <span>已归档</span>
      </div>
      <div class="stat-value">{{ archiveCount }}</div>
      <div class="stat-subtext">已归档</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-title">
        <n-icon :size="18" class="stat-icon">
          <CheckmarkCircleOutline />
        </n-icon>
        <span>任务进度</span>
      </div>
      <div class="stat-value">{{ taskValue }}</div>
      <div class="stat-subtext">{{ taskPercentText }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NIcon } from 'naive-ui'
import { DocumentTextOutline, GitBranchOutline, ArchiveOutline, CheckmarkCircleOutline } from '@vicons/ionicons5'
import { useOpenSpecStore } from '../../../stores/openspec'
import { readFile as readFileApi } from '../../../api/openspec'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({})
  }
})

const store = useOpenSpecStore()
const requirementsCount = ref(0)
const requirementsLoading = ref(false)
const tasksDone = ref(0)
const tasksTotal = ref(0)
const tasksLoading = ref(false)
const requirementsCache = ref({})
const tasksCache = ref({})

const specCount = computed(() => props.stats?.specCount ?? 0)
const changeCount = computed(() => props.stats?.changeCount ?? 0)
const archiveCount = computed(() => props.stats?.archiveCount ?? 0)

const requirementsText = computed(() => {
  if (requirementsLoading.value) return '统计中...'
  return `${requirementsCount.value} 项要求`
})

const taskValue = computed(() => {
  if (tasksLoading.value && tasksTotal.value === 0) return '0/0'
  return `${tasksDone.value}/${tasksTotal.value}`
})

const taskPercentText = computed(() => {
  if (!tasksTotal.value) return '0% 完成'
  const percent = Math.round((tasksDone.value / tasksTotal.value) * 100)
  return `${percent}% 完成`
})

watch(
  () => store.projectPath,
  () => {
    requirementsCache.value = {}
    tasksCache.value = {}
    requirementsCount.value = 0
    tasksDone.value = 0
    tasksTotal.value = 0
  }
)

watch(
  () => store.data.specs,
  () => {
    loadRequirements()
  },
  { deep: true, immediate: true }
)

watch(
  () => store.data.changes,
  () => {
    loadTasks()
  },
  { deep: true, immediate: true }
)

async function loadRequirements() {
  if (!store.projectPath) return
  const specFiles = collectSpecFiles(store.data.specs || [])
  requirementsLoading.value = true
  const counts = await Promise.all(specFiles.map(async (filePath) => {
    if (requirementsCache.value[filePath] != null) {
      return requirementsCache.value[filePath]
    }
    try {
      const result = await readFileApi(store.projectPath, filePath)
      const count = countRequirements(result?.content || '')
      requirementsCache.value = { ...requirementsCache.value, [filePath]: count }
      return count
    } catch (err) {
      requirementsCache.value = { ...requirementsCache.value, [filePath]: 0 }
      return 0
    }
  }))
  requirementsCount.value = counts.reduce((sum, count) => sum + (count || 0), 0)
  requirementsLoading.value = false
}

async function loadTasks() {
  if (!store.projectPath) return
  const taskPaths = collectTaskPaths(store.data.changes || [])
  tasksLoading.value = true
  if (taskPaths.length === 0) {
    tasksDone.value = 0
    tasksTotal.value = 0
    tasksLoading.value = false
    return
  }
  const counts = await Promise.all(taskPaths.map(async (filePath) => {
    if (tasksCache.value[filePath]) {
      return tasksCache.value[filePath]
    }
    try {
      const result = await readFileApi(store.projectPath, filePath)
      const stats = countTasks(result?.content || '')
      tasksCache.value = { ...tasksCache.value, [filePath]: stats }
      return stats
    } catch (err) {
      const stats = { done: 0, total: 0 }
      tasksCache.value = { ...tasksCache.value, [filePath]: stats }
      return stats
    }
  }))
  tasksDone.value = counts.reduce((sum, item) => sum + (item?.done || 0), 0)
  tasksTotal.value = counts.reduce((sum, item) => sum + (item?.total || 0), 0)
  tasksLoading.value = false
}

function collectSpecFiles(nodes, output = []) {
  nodes.forEach((node) => {
    if (node.type === 'file' && node.name === 'spec.md') {
      output.push(node.path)
      return
    }
    if (node.type === 'directory' && node.children?.length) {
      collectSpecFiles(node.children, output)
    }
  })
  return output
}

function collectTaskPaths(nodes, output = []) {
  (nodes || [])
    .filter(node => node.type === 'directory' && node.name !== 'archive')
    .forEach((node) => {
      const found = findTasksPath(node)
      if (found) output.push(found)
    })
  return output
}

function findTasksPath(node) {
  if (!node) return ''
  const direct = (node.children || []).find(child => child.type === 'file' && child.name === 'tasks.md')
  if (direct) return direct.path
  for (const child of node.children || []) {
    if (child.type === 'directory') {
      const found = findTasksPath(child)
      if (found) return found
    }
  }
  return ''
}

function countRequirements(content) {
  const text = String(content || '')
  const matches = text.match(/^#{2,6}\s+Requirement:/gm)
  return matches ? matches.length : 0
}

function countTasks(content) {
  const lines = String(content || '').split('\n')
  let total = 0
  let done = 0
  lines.forEach((line) => {
    const match = line.match(/^\s*[-*]\s+\[([ xX])\]/)
    if (!match) return
    total += 1
    if (match[1].toLowerCase() === 'x') done += 1
  })
  return { done, total }
}

function joinPath(base, file) {
  if (!base) return file
  return `${base.replace(/\/$/, '')}/${file}`
}
</script>

<style scoped>
.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 12px;
}

.stat-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
  margin-bottom: 10px;
}

.stat-icon {
  color: #334155;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: #111827;
  letter-spacing: 0.3px;
}

.stat-subtext {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
}
</style>
