import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDashboardStore } from '../stores/dashboard'
import { getSkills } from '../api/skills'

const skills = ref([])
const skillsLoading = ref(false)
const skillsLoaded = ref(false)
let skillsPromise = null

async function loadSkills(forceRefresh = false) {
  if (skillsLoaded.value && !forceRefresh) {
    return skills.value
  }
  if (skillsPromise && !forceRefresh) {
    return skillsPromise
  }

  skillsLoading.value = true
  skillsPromise = (async () => {
    try {
      const result = await getSkills(forceRefresh)
      if (result && result.success) {
        skills.value = result.skills || []
        skillsLoaded.value = true
        return skills.value
      }
      throw new Error(result?.message || '加载技能列表失败')
    } finally {
      skillsLoading.value = false
      skillsPromise = null
    }
  })()

  return skillsPromise
}

const claudeSkillsCount = computed(() =>
  skills.value.filter(s => s.installedPlatforms?.includes('claude')).length
)

const codexSkillsCount = computed(() =>
  skills.value.filter(s => s.installedPlatforms?.includes('codex')).length
)

const geminiSkillsCount = computed(() =>
  skills.value.filter(s => s.installedPlatforms?.includes('gemini')).length
)

export function useDashboard() {
  const store = useDashboardStore()
  const {
    dashboardData,
    isLoading,
    isLoaded
  } = storeToRefs(store)

  return {
    dashboardData,
    isLoading,
    isLoaded,
    skills,
    skillsLoading,
    skillsLoaded,
    loadSkills,
    claudeSkillsCount,
    codexSkillsCount,
    geminiSkillsCount,
    loadDashboard: store.loadDashboard,
    enableAutoRefresh: store.enableAutoRefresh,
    disableAutoRefresh: store.disableAutoRefresh,
    refreshChannels: store.refreshChannels,
    refreshProxyStatus: store.refreshProxyStatus,
    refreshStats: store.refreshStats
  }
}
