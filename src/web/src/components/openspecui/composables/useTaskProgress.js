import { reactive, watch } from 'vue'
import { readFile as readFileApi } from '../../../api/openspec'
import { useOpenSpecStore } from '../../../stores/openspec'

export function parseTasks(content = '') {
  const lines = String(content || '').split('\n')
  const items = []
  const groups = []
  const stack = []
  let groupIndex = 0
  let fallbackGroup = null

  const pushGroup = (group, level) => {
    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop()
    }
    group.level = level
    stack.push(group)
    groups.push(group)
  }

  const getCurrentGroup = () => {
    if (stack.length) return stack[stack.length - 1]
    if (!fallbackGroup) {
      fallbackGroup = {
        key: `group-fallback-${groupIndex++}`,
        title: '未分组任务',
        descriptionLines: [],
        tasks: []
      }
      groups.push(fallbackGroup)
    }
    return fallbackGroup
  }

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      if (title) {
        const group = {
          key: `group-${groupIndex++}`,
          title,
          descriptionLines: [],
          tasks: [],
          collectingDescription: true,
          level
        }
        pushGroup(group, level)
      }
      return
    }

    const match = line.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/)
    if (match) {
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
      const group = getCurrentGroup()
      group.tasks.push(item)
      group.collectingDescription = false
      return
    }

    const group = stack.length ? stack[stack.length - 1] : null
    if (group && group.collectingDescription && line.trim()) {
      group.descriptionLines.push(line)
    }
  })

  groups.forEach((group) => {
    group.description = (group.descriptionLines || []).join('\n').trim()
    group.total = group.tasks.length
    group.done = group.tasks.filter(task => task.checked).length
    delete group.descriptionLines
    delete group.collectingDescription
  })

  return {
    lines,
    items,
    groups: groups.filter(group => group.total > 0 || group.description)
  }
}

function joinPath(base, file) {
  if (!base) return file
  return `${base.replace(/\/$/, '')}/${file}`
}

function hasChildFile(item, fileName) {
  return (item?.children || []).some(child => child.type === 'file' && child.name === fileName)
}

export function useTaskProgress() {
  const store = useOpenSpecStore()
  const progressMap = reactive({})
  const loadingMap = reactive({})

  watch(
    () => store.projectPath,
    () => {
      Object.keys(progressMap).forEach((key) => delete progressMap[key])
      Object.keys(loadingMap).forEach((key) => delete loadingMap[key])
    }
  )

  async function loadProgress(item) {
    if (!store.projectPath || !item?.path) return
    const hasTasksFile = hasChildFile(item, 'tasks.md')
    const existing = progressMap[item.path]
    if (!hasTasksFile) {
      progressMap[item.path] = { total: 0, done: 0, percentage: 0, missing: true }
      return
    }
    if ((existing && !existing.missing) || loadingMap[item.path]) return
    loadingMap[item.path] = true
    const filePath = joinPath(item.path, 'tasks.md')
    try {
      const result = await readFileApi(store.projectPath, filePath)
      const parsed = parseTasks(result?.content || '')
      const total = parsed.items.length
      const done = parsed.items.filter(task => task.checked).length
      const percentage = total > 0 ? Math.round((done / total) * 100) : 0
      progressMap[item.path] = { total, done, percentage }
    } catch (err) {
      progressMap[item.path] = { total: 0, done: 0, percentage: 0 }
    } finally {
      loadingMap[item.path] = false
    }
  }

  function getProgress(item) {
    if (!item?.path) return { total: 0, done: 0, percentage: 0 }
    return progressMap[item.path] || { total: 0, done: 0, percentage: 0 }
  }

  function isLoading(item) {
    if (!item?.path) return false
    return !!loadingMap[item.path]
  }

  return {
    loadProgress,
    getProgress,
    isLoading,
    progressMap,
    loadingMap
  }
}
