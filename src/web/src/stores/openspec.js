import { defineStore } from 'pinia'
import { computed, ref, reactive } from 'vue'
import {
  getDashboard,
  getProjects,
  getSpecs,
  getChanges,
  getArchives,
  getSettings,
  getCliInfo,
  getTools,
  saveSettings as saveSettingsApi,
  readFile as readFileApi,
  writeFile as writeFileApi,
  resolveConflict as resolveConflictApi
} from '../api/openspec'
import { LRUCache } from '../utils/fileCache'
import { filterBySearchQuery } from '../components/openspecui/composables/useSearch'

const DEFAULT_TAB = 'dashboard'

export const useOpenSpecStore = defineStore('openspec', () => {
  const drawerOpen = ref(false)
  const activeTab = ref(DEFAULT_TAB)
  const projectPath = ref('')
  const projectName = ref('')
  const channel = ref('claude')
  const syncStatus = ref('idle')
  const lastUpdated = ref(null)
  const loading = ref(false)
  const searchQuery = ref('')
  const editMode = ref(false)
  const hasUnsavedChanges = ref(false)
  const tabLoading = reactive({
    dashboard: false,
    projects: false,
    specs: false,
    changes: false,
    archives: false,
    settings: false
  })

  const data = reactive({
    dashboard: null,
    projects: [],
    specs: [],
    changes: [],
    archives: [],
    settings: null,
    cli: null,
    tools: []
  })

  const fileCache = new LRUCache(50)
  const currentFile = ref(null)
  const editorOpen = ref(false)
  const conflict = ref(null)
  const detailRefreshKey = ref(0)

  const filteredChanges = computed(() => {
    return filterBySearchQuery(data.changes || [], searchQuery.value, {
      fields: ['name', 'path']
    })
  })

  const filteredArchives = computed(() => {
    return filterBySearchQuery(data.archives || [], searchQuery.value, {
      fields: ['name', 'path']
    })
  })

  function setContext({ name, path, source }) {
    const changed = projectPath.value && projectPath.value !== path
    projectName.value = name || ''
    projectPath.value = path || ''
    channel.value = source || 'claude'
    if (changed) {
      fileCache.clear()
      currentFile.value = null
      editorOpen.value = false
      conflict.value = null
      data.tools = []
      data.cli = null
      searchQuery.value = ''
      editMode.value = false
      hasUnsavedChanges.value = false
    }
  }

  function setDrawerOpen(value) {
    drawerOpen.value = value
  }

  function setActiveTab(tab) {
    activeTab.value = tab || DEFAULT_TAB
  }

  function setSearchQuery(value) {
    searchQuery.value = String(value || '')
  }

  function setEditMode(value) {
    editMode.value = !!value
  }

  function setHasUnsavedChanges(value) {
    hasUnsavedChanges.value = !!value
  }

  async function refreshAll() {
    if (!projectPath.value) return
    loading.value = true
    syncStatus.value = 'syncing'
    try {
      const [dashboard, projects, specs, changes, archives, settings] = await Promise.all([
        getDashboard(projectPath.value),
        getProjects(projectPath.value),
        getSpecs(projectPath.value),
        getChanges(projectPath.value),
        getArchives(projectPath.value),
        getSettings(projectPath.value)
      ])
      data.dashboard = dashboard
      data.projects = projects.items || []
      data.specs = specs.tree || []
      data.changes = changes.tree || []
      data.archives = archives.tree || []
      data.settings = settings
      lastUpdated.value = Date.now()
      syncStatus.value = 'synced'
    } catch (err) {
      syncStatus.value = 'error'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function refreshTab(tab) {
    if (!projectPath.value) return
    const target = tab || activeTab.value
    if (!tabLoading[target]) {
      tabLoading[target] = true
    }
    syncStatus.value = 'syncing'

    try {
      if (target === 'dashboard') {
        data.dashboard = await getDashboard(projectPath.value)
      } else if (target === 'projects') {
        const projects = await getProjects(projectPath.value)
        data.projects = projects.items || []
      } else if (target === 'specs') {
        const specs = await getSpecs(projectPath.value)
        data.specs = specs.tree || []
      } else if (target === 'changes') {
        const changes = await getChanges(projectPath.value)
        data.changes = changes.tree || []
      } else if (target === 'archives') {
        const archives = await getArchives(projectPath.value)
        data.archives = archives.tree || []
      } else if (target === 'settings') {
        const settings = await getSettings(projectPath.value)
        const [cliResult, toolsResult] = await Promise.allSettled([
          getCliInfo(),
          getTools(projectPath.value)
        ])
        data.settings = settings
        data.cli = cliResult.status === 'fulfilled' ? cliResult.value : null
        data.tools = toolsResult.status === 'fulfilled' ? (toolsResult.value.items || []) : []
      }
      lastUpdated.value = Date.now()
      syncStatus.value = 'synced'
    } catch (err) {
      syncStatus.value = 'error'
      throw err
    } finally {
      tabLoading[target] = false
    }
  }

  async function readFile(filePath) {
    if (!projectPath.value) return null
    const cached = fileCache.get(filePath)
    if (cached) {
      currentFile.value = { path: filePath, ...cached }
      editorOpen.value = true
      conflict.value = null
      return currentFile.value
    }
    const result = await readFileApi(projectPath.value, filePath)
    fileCache.set(filePath, result)
    currentFile.value = { path: filePath, ...result }
    editorOpen.value = true
    conflict.value = null
    return currentFile.value
  }

  async function writeFile(filePath, content, etag) {
    if (!projectPath.value) return null
    syncStatus.value = 'syncing'
    try {
      const result = await writeFileApi(projectPath.value, filePath, content, etag)
      fileCache.set(filePath, result)
      currentFile.value = { path: filePath, ...result }
      conflict.value = null
      syncStatus.value = 'synced'
      lastUpdated.value = Date.now()
      return result
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data) {
        conflict.value = {
          path: filePath,
          current: err.response.data.current,
          etag: err.response.data.etag,
          local: content
        }
        syncStatus.value = 'conflict'
        return { conflict: true }
      }
      syncStatus.value = 'error'
      throw err
    }
  }

  async function saveContent(filePath, content, etag) {
    const result = await writeFile(filePath, content, etag)
    if (result?.conflict) return result
    hasUnsavedChanges.value = false
    editMode.value = false
    return result
  }

  async function resolveConflict(filePath, resolution, content) {
    if (!projectPath.value) return null
    const result = await resolveConflictApi(projectPath.value, filePath, resolution, content)
    fileCache.set(filePath, result)
    currentFile.value = { path: filePath, ...result }
    conflict.value = null
    syncStatus.value = 'synced'
    lastUpdated.value = Date.now()
    return result
  }

  function updateFromRemote(change) {
    if (!change?.path) return
    if (change.event === 'unlink') {
      fileCache.delete(change.path)
      if (currentFile.value?.path === change.path) {
        currentFile.value = null
        editorOpen.value = false
      }
      syncStatus.value = 'synced'
      return
    }

    const cached = fileCache.get(change.path)
    if (change.content) {
      const payload = {
        content: change.content,
        etag: change.etag,
        size: change.size,
        isLarge: change.isLarge
      }
      fileCache.set(change.path, payload)
      if (currentFile.value?.path === change.path) {
        currentFile.value = { path: change.path, ...payload }
      }
      lastUpdated.value = Date.now()
      syncStatus.value = 'synced'
      return
    }

    if (cached && change.diff) {
      fileCache.set(change.path, { ...cached, diff: change.diff, etag: change.etag })
    }
  }

  function closeEditor() {
    editorOpen.value = false
  }

  function triggerDetailRefresh() {
    detailRefreshKey.value++
  }

  async function saveSettings(settings) {
    if (!projectPath.value) return null
    const result = await saveSettingsApi(projectPath.value, settings)
    data.settings = result
    return result
  }

  async function createSpec() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dirName = `spec-${timestamp}`
    const filePath = `specs/${dirName}/spec.md`
    const content = `# 规范: ${dirName}\n\n## ADDED Requirements\n### Requirement: 新增能力\n系统必须提供一个新的规范能力说明。\n\n#### Scenario: 基础场景\n- **WHEN** 用户创建新的规范\n- **THEN** 系统可读取并展示内容\n`
    await writeFile(filePath, content)
    await refreshTab('specs')
    await readFile(filePath)
    return filePath
  }

  async function createChange() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const changeId = `add-change-${timestamp}`
    const proposalPath = `changes/${changeId}/proposal.md`
    const tasksPath = `changes/${changeId}/tasks.md`
    const proposalContent = `# Proposal: ${changeId}\n\n## Why\n描述变更动机。\n\n## What Changes\n- 说明本次变更范围\n\n## Impact\n- 影响的规格或模块\n`
    const tasksContent = `# Tasks: ${changeId}\n\n- [ ] 1. 填写实现任务\n`

    await writeFile(proposalPath, proposalContent)
    await writeFile(tasksPath, tasksContent)
    await refreshTab('changes')
    await readFile(proposalPath)
    return changeId
  }

  return {
    drawerOpen,
    activeTab,
    projectPath,
    projectName,
    channel,
    syncStatus,
    lastUpdated,
    loading,
    tabLoading,
    data,
    fileCache,
    currentFile,
    editorOpen,
    conflict,
    detailRefreshKey,
    searchQuery,
    editMode,
    hasUnsavedChanges,
    filteredChanges,
    filteredArchives,
    setContext,
    setDrawerOpen,
    setActiveTab,
    setSearchQuery,
    setEditMode,
    setHasUnsavedChanges,
    refreshAll,
    refreshTab,
    readFile,
    writeFile,
    saveContent,
    resolveConflict,
    updateFromRemote,
    closeEditor,
    triggerDetailRefresh,
    saveSettings,
    createSpec,
    createChange
  }
})
