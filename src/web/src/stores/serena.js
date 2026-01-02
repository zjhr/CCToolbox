import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  getHealth,
  getOverview,
  getMemories,
  readMemory,
  writeMemory,
  deleteMemory,
  batchDeleteMemories,
  getFiles,
  getCacheStatus,
  getSymbols,
  getSymbolReferences,
  getSettings,
  saveSettings as saveSettingsApi
} from '../api/serena'

const DEFAULT_TAB = 'overview'

export const useSerenaStore = defineStore('serena', () => {
  const drawerOpen = ref(false)
  const activeTab = ref(DEFAULT_TAB)
  const projectPath = ref('')
  const projectName = ref('')
  const channel = ref('claude')
  const lastUpdated = ref(null)
  const error = ref('')
  const cacheStatus = ref({ exists: false, path: '', mtime: null })
  const cacheMtime = ref(null)
  const symbolQuery = ref('')
  const memoryQuery = ref('')
  let cachePollingTimer = null
  let cachePollingBusy = false

  const loading = reactive({
    health: false,
    overview: false,
    memories: false,
    memoryDetail: false,
    files: false,
    symbols: false,
    settings: false,
    references: false
  })

  const health = reactive({
    hasSerena: false,
    hasConfig: false,
    message: ''
  })

  const overview = ref(null)
  const memories = ref([])
  const selectedMemory = ref('')
  const memoryContent = ref('')

  const files = ref([])
  const selectedFile = ref('')
  const symbols = ref([])
  const references = ref([])

  const settings = ref(null)

  function setContext({ name, path, source }) {
    const changed = projectPath.value && projectPath.value !== path
    projectName.value = name || ''
    projectPath.value = path || ''
    channel.value = source || 'claude'
    if (changed) {
      stopCachePolling()
      selectedMemory.value = ''
      memoryContent.value = ''
      selectedFile.value = ''
      symbols.value = []
      references.value = []
      symbolQuery.value = ''
      memoryQuery.value = ''
      cacheMtime.value = null
      cacheStatus.value = { exists: false, path: '', mtime: null }
    }
  }

  function setDrawerOpen(value) {
    drawerOpen.value = value
  }

  function setActiveTab(tab) {
    activeTab.value = tab || DEFAULT_TAB
  }

  function setSymbolQuery(value) {
    symbolQuery.value = String(value || '')
  }

  function setMemoryQuery(value) {
    memoryQuery.value = String(value || '')
  }

  async function fetchCacheStatus() {
    if (!projectPath.value) return null
    const result = await getCacheStatus(projectPath.value)
    const data = result?.data || {}
    cacheStatus.value = {
      exists: !!data.exists,
      path: data.path || '',
      mtime: data.mtime || null
    }
    return cacheStatus.value
  }

  async function refreshCacheStatus() {
    if (!projectPath.value || !health.hasSerena || cachePollingBusy) return null
    cachePollingBusy = true
    try {
      const status = await fetchCacheStatus()
      const nextMtime = status?.mtime || null
      const hasChanged = nextMtime && nextMtime !== cacheMtime.value
      const removed = !nextMtime && cacheMtime.value

      if (hasChanged) {
        cacheMtime.value = nextMtime
        await fetchFiles()
        if (selectedFile.value) {
          await fetchSymbols({
            filePath: selectedFile.value,
            query: symbolQuery.value
          })
        }
      } else if (removed) {
        cacheMtime.value = null
        files.value = []
        symbols.value = []
        selectedFile.value = ''
      }
      return status
    } finally {
      cachePollingBusy = false
    }
  }

  function startCachePolling() {
    stopCachePolling()
    if (!projectPath.value || !health.hasSerena) return
    refreshCacheStatus().catch(() => {})
    cachePollingTimer = setInterval(() => {
      refreshCacheStatus().catch(() => {})
    }, 5000)
  }

  function stopCachePolling() {
    if (cachePollingTimer) {
      clearInterval(cachePollingTimer)
      cachePollingTimer = null
    }
  }

  async function checkHealth() {
    if (!projectPath.value) return null
    loading.health = true
    try {
      const result = await getHealth(projectPath.value)
      if (result?.success) {
        health.hasSerena = !!result.data?.hasSerena
        health.hasConfig = !!result.data?.hasConfig
        health.message = result.data?.message || ''
      } else {
        health.hasSerena = false
        health.hasConfig = false
        health.message = result?.error?.message || '健康检查失败'
      }
      return result
    } catch (err) {
      health.hasSerena = false
      health.hasConfig = false
      health.message = err.message
      throw err
    } finally {
      loading.health = false
    }
  }

  async function fetchOverview() {
    if (!projectPath.value) return null
    loading.overview = true
    try {
      const result = await getOverview(projectPath.value)
      overview.value = result?.data || null
      lastUpdated.value = Date.now()
      return overview.value
    } finally {
      loading.overview = false
    }
  }

  async function fetchMemories() {
    if (!projectPath.value) return null
    loading.memories = true
    try {
      const result = await getMemories(projectPath.value, { query: memoryQuery.value })
      memories.value = result?.data?.items || []
      return memories.value
    } finally {
      loading.memories = false
    }
  }

  async function openMemory(name) {
    if (!projectPath.value || !name) return null
    loading.memoryDetail = true
    try {
      const result = await readMemory(projectPath.value, name)
      selectedMemory.value = result?.data?.name || name
      memoryContent.value = result?.data?.content || ''
      return result?.data
    } finally {
      loading.memoryDetail = false
    }
  }

  async function saveMemory(name, content) {
    if (!projectPath.value || !name) return null
    const result = await writeMemory(projectPath.value, name, content)
    memoryContent.value = content
    await fetchMemories()
    return result?.data
  }

  async function removeMemory(name) {
    if (!projectPath.value || !name) return null
    const result = await deleteMemory(projectPath.value, name)
    if (selectedMemory.value === name) {
      selectedMemory.value = ''
      memoryContent.value = ''
    }
    await fetchMemories()
    return result?.data
  }

  async function removeMemories(names) {
    if (!projectPath.value || !Array.isArray(names) || names.length === 0) return null
    const result = await batchDeleteMemories(projectPath.value, names)
    if (names.includes(selectedMemory.value)) {
      selectedMemory.value = ''
      memoryContent.value = ''
    }
    await fetchMemories()
    return result?.data
  }

  async function fetchFiles() {
    if (!projectPath.value) return null
    loading.files = true
    try {
      const result = await getFiles(projectPath.value)
      files.value = result?.data?.tree || []
      return files.value
    } finally {
      loading.files = false
    }
  }

  async function fetchSymbols(options = {}) {
    if (!projectPath.value) return null
    loading.symbols = true
    try {
      const result = await getSymbols(projectPath.value, options)
      const payload = result?.data
      symbols.value = Array.isArray(payload) ? payload : []
      return symbols.value
    } finally {
      loading.symbols = false
    }
  }

  async function fetchReferences(symbol) {
    if (!projectPath.value || !symbol) return null
    loading.references = true
    try {
      const result = await getSymbolReferences(projectPath.value, symbol)
      references.value = result?.data?.items || []
      return references.value
    } finally {
      loading.references = false
    }
  }

  async function fetchSettings() {
    if (!projectPath.value) return null
    loading.settings = true
    try {
      const result = await getSettings(projectPath.value)
      settings.value = result?.data || null
      return settings.value
    } finally {
      loading.settings = false
    }
  }

  async function saveSettings(settingsPayload) {
    if (!projectPath.value) return null
    const result = await saveSettingsApi(projectPath.value, settingsPayload)
    settings.value = result?.data || null
    return settings.value
  }

  async function refreshAll() {
    if (!projectPath.value) return null
    error.value = ''
    await checkHealth()
    if (!health.hasSerena) {
      stopCachePolling()
      overview.value = null
      memories.value = []
      files.value = []
      symbols.value = []
      settings.value = null
      cacheMtime.value = null
      cacheStatus.value = { exists: false, path: '', mtime: null }
      return null
    }
    await Promise.all([
      fetchOverview(),
      fetchMemories(),
      fetchFiles()
    ])
    return true
  }

  return {
    drawerOpen,
    activeTab,
    projectPath,
    projectName,
    channel,
    lastUpdated,
    error,
    cacheStatus,
    loading,
    health,
    overview,
    memories,
    selectedMemory,
    memoryContent,
    files,
    selectedFile,
    symbols,
    references,
    settings,
    setContext,
    setDrawerOpen,
    setActiveTab,
    setSymbolQuery,
    setMemoryQuery,
    startCachePolling,
    stopCachePolling,
    checkHealth,
    fetchOverview,
    fetchMemories,
    openMemory,
    saveMemory,
    removeMemory,
    removeMemories,
    fetchFiles,
    fetchCacheStatus,
    fetchSymbols,
    fetchReferences,
    fetchSettings,
    saveSettings,
    refreshAll
  }
})
