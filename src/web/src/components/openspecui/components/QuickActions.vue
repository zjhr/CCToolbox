<template>
  <div class="quick-actions">
    <div class="quick-group">
      <div class="group-title">变更</div>
      <div class="quick-row" @click="goChanges">
        <div class="row-main">
          <div class="row-meta">
            已完成 {{ changeProgress.done }}/{{ changeProgress.total }}
          </div>
          <n-progress
            type="line"
            :percentage="changeProgress.percent"
            :show-indicator="false"
            :color="changeProgress.percent >= 100 ? '#18a058' : '#f0a020'"
          />
        </div>
      </div>
    </div>
    <div class="quick-group">
      <div class="group-title">规范</div>
      <div class="quick-row" @click="goSpecs">
        <div class="row-main">
          <div class="row-meta">当前 {{ stats.specCount || 0 }} 个规范</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NProgress } from 'naive-ui'
import { useOpenSpecStore } from '../../../stores/openspec'
import { readFile as readFileApi } from '../../../api/openspec'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({})
  }
})

const store = useOpenSpecStore()
const stats = computed(() => props.stats || {})
const changeProgress = ref({
  done: 0,
  total: 0,
  percent: 0
})
let progressToken = 0

watch(
  () => [store.projectPath, store.data.changes],
  () => {
    refreshChangeProgress()
  },
  { immediate: true, deep: true }
)

async function refreshChangeProgress() {
  const token = ++progressToken
  if (!store.projectPath) {
    changeProgress.value = { done: 0, total: 0, percent: 0 }
    return
  }
  const changeDirs = (store.data.changes || []).filter(
    node => node.type === 'directory' && node.name !== 'archive'
  )
  if (changeDirs.length === 0) {
    changeProgress.value = { done: 0, total: 0, percent: 0 }
    return
  }

  const taskPaths = changeDirs
    .map(node => findTasksPath(node))
    .filter(Boolean)
  if (taskPaths.length === 0) {
    changeProgress.value = { done: 0, total: 0, percent: 0 }
    return
  }

  const results = await Promise.allSettled(
    taskPaths.map(filePath => readFileApi(store.projectPath, filePath))
  )
  if (token !== progressToken) return

  let total = 0
  let done = 0
  results.forEach(result => {
    if (result.status !== 'fulfilled') return
    const count = countTasks(result.value?.content || '')
    total += count.total
    done += count.done
  })

  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  changeProgress.value = { done, total, percent }
}

function countTasks(content) {
  const lines = String(content || '').split('\n')
  let total = 0
  let done = 0
  lines.forEach(line => {
    const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+/)
    if (!match) return
    total += 1
    if (match[1].toLowerCase() === 'x') {
      done += 1
    }
  })
  return { done, total }
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

function goChanges() {
  store.setActiveTab('changes')
  store.refreshTab('changes')
}

function goSpecs() {
  store.setActiveTab('specs')
  store.refreshTab('specs')
}
</script>

<style scoped>
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quick-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-title {
  font-size: 12px;
  color: #666;
  letter-spacing: 0.5px;
}

.quick-row {
  padding: 10px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-row:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.12);
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
}

.row-meta {
  font-size: 12px;
  color: #666;
}
</style>
