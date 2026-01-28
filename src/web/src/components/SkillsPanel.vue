<template>
  <div class="skills-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <div class="header-left">
        <n-button v-if="!props.hideBack" text @click="handleBack" class="back-btn">
          <template #icon>
            <n-icon><ArrowBackOutline /></n-icon>
          </template>
        </n-button>
        <span class="panel-title">Skills 技能管理</span>
        <n-tag type="info" size="small" :bordered="false">
          {{ installedCount }}/{{ skills.length }}
        </n-tag>
      </div>
      <div class="header-right">
        <n-button text @click="handleOpenUpload" class="action-btn" aria-label="新增技能">
          <template #icon>
            <n-icon><AddOutline /></n-icon>
          </template>
          新增技能
        </n-button>
        <n-button text @click="showRepoManager = true" class="action-btn">
          <template #icon>
            <n-icon><GitBranchOutline /></n-icon>
          </template>
          仓库
        </n-button>
        <n-button text @click="handleRefresh" :loading="loading" class="action-btn">
          <template #icon>
            <n-icon><RefreshOutline /></n-icon>
          </template>
          刷新
        </n-button>
      </div>
    </div>

    <!-- 搜索和筛选 -->
    <div class="filter-bar">
      <!-- 平台筛选标签 (仅在非 Drawer 模式显示) -->
      <div class="platform-filters" v-if="platforms.length > 0">
        <div
          v-for="platform in platforms"
          :key="platform.id"
          class="platform-filter-tag"
          :class="[
            { active: selectedPlatforms.includes(platform.id) },
            `platform-${platform.id}`
          ]"
          @click="togglePlatform(platform.id)"
        >
          {{ platform.name }}
        </div>
      </div>

      <div class="search-row">
        <n-input
          v-model:value="searchQuery"
          placeholder="搜索技能..."
          clearable
          size="small"
          class="search-input"
        >
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
        <n-select
          v-model:value="filterStatus"
          size="small"
          class="filter-select"
          :options="filterOptions"
        />
      </div>
    </div>

    <n-alert
      v-if="repoWarnings.length > 0"
      type="warning"
      :bordered="false"
      size="small"
      class="repo-warning"
      closable
      @close="handleDismissWarnings"
    >
      <div class="repo-warning-title">仓库拉取异常，已自动处理：</div>
      <div
        v-for="warning in repoWarnings"
        :key="`${warning.repo}-${warning.message}`"
        class="repo-warning-item"
      >
        <span class="repo-warning-repo">{{ warning.repo }}</span>
        <span class="repo-warning-message">{{ warning.message }}</span>
      </div>
    </n-alert>

    <!-- 技能列表 -->
    <div class="skills-content">
      <n-spin :show="loading">
        <div v-if="filteredSkills.length === 0 && !loading" class="empty-state">
          <n-empty :description="emptyText">
            <template #icon>
              <n-icon size="48" color="var(--text-quaternary)">
                <ExtensionPuzzleOutline />
              </n-icon>
            </template>
            <template #extra>
              <n-button size="small" @click="showRepoManager = true" v-if="skills.length === 0">
                配置仓库源
              </n-button>
            </template>
          </n-empty>
        </div>

        <div v-else class="skills-grid">
          <SkillCard
            v-for="skill in filteredSkills"
            :key="getSkillKey(skill)"
            :skill="skill"
            :loading="!!actionLoadingKeys[getSkillKey(skill)]"
            @install="handleInstall"
            @uninstall="handleUninstall"
            @disable="handleDisable"
            @enable="handleEnable"
            @delete="handleDelete"
            @reinstall="handleReinstall"
            @configure-update="handleOpenUpdateSource"
            @update="handleManualUpdate"
            @click="handleCardClick"
          />
        </div>
      </n-spin>
    </div>

    <div class="panel-footer">
      <n-icon size="14" class="info-icon"><InformationCircleOutline /></n-icon>
      <span>安装/卸载/禁用后需重启应用生效</span>
    </div>

    <!-- 仓库管理弹窗 -->
    <SkillRepoManager
      v-model:visible="showRepoManager"
      @updated="loadSkills"
    />

    <!-- 创建技能弹窗 -->
    <SkillCreateModal
      v-model:visible="showCreateModal"
      @created="handleCreateComplete"
    />

    <!-- 上传技能弹窗 -->
    <SkillUploadModal
      v-model:visible="showUploadModal"
      @uploaded="handleUploadComplete"
      @open-create="handleOpenCreateFromUpload"
    />

    <!-- 更新检测弹窗 -->
    <!-- 技能详情弹窗 -->
    <SkillDetailModal
      v-model:visible="showDetailModal"
      :skill="selectedSkill"
      @updated="loadSkills"
    />

    <!-- 平台选择弹窗 -->
    <SkillPlatformModal
      v-model:visible="showPlatformModal"
      :mode="platformModalMode"
      :skill="platformModalSkill"
      :platforms="platforms"
      @confirm="confirmPlatformSelection"
    />

    <SkillUpdateModal
      v-model:visible="showUpdateSourceModal"
      :skill="updateSourceSkill"
      @saved="handleUpdateSourceSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import {
  NButton,
  NInput,
  NSelect,
  NIcon,
  NTag,
  NSpin,
  NEmpty,
  NAlert
} from 'naive-ui'
import {
  ArrowBackOutline,
  GitBranchOutline,
  RefreshOutline,
  SearchOutline,
  InformationCircleOutline,
  AddOutline,
  ExtensionPuzzleOutline
} from '@vicons/ionicons5'
import {
  getSkills, installSkill, uninstallSkill, getPlatforms,
  disableSkill, enableSkill, deleteCachedSkill, reinstallSkill, updateSkill
} from '../api/skills'
import message, { dialog } from '../utils/message'
import { useDashboard } from '../composables/useDashboard'
import SkillCard from './SkillCard.vue'
import SkillRepoManager from './SkillRepoManager.vue'
import SkillCreateModal from './SkillCreateModal.vue'
import SkillUploadModal from './SkillUploadModal.vue'
import SkillDetailModal from './SkillDetailModal.vue'
import SkillPlatformModal from './SkillPlatformModal.vue'
import SkillUpdateModal from './SkillUpdateModal.vue'

const props = defineProps({
  hideBack: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['back', 'updated'])

const skills = ref([])
const repoWarnings = ref([])
const loading = ref(false)
const searchQuery = ref('')
const filterStatus = ref('all')
const platforms = ref([])
const selectedPlatforms = ref([])
const showRepoManager = ref(false)
const showCreateModal = ref(false)
const showUploadModal = ref(false)
const showDetailModal = ref(false)
const showPlatformModal = ref(false)
const showUpdateSourceModal = ref(false)
const platformModalMode = ref('install')
const platformModalSkill = ref(null)
const selectedSkill = ref(null)
const updateSourceSkill = ref(null)
const pendingUploadSkill = ref(null)
const actionLoadingKeys = ref({}) // 记录正在执行操作的技能 key
const lastFocusEl = ref(null)
const { skills: globalSkills, skillsLoaded: globalSkillsLoaded } = useDashboard()

const defaultFilterOptions = [
  { label: '全部', value: 'all' },
  { label: '已安装', value: 'installed' },
  { label: '未安装', value: 'uninstalled' }
]

const filterOptions = defaultFilterOptions

let warningTimer = null

const installedCount = computed(() => skills.value.filter(s => s.installed).length)

function getSkillKey(skill) {
  return skill.key || skill.directory
}

const filteredSkills = computed(() => {
  let result = skills.value

  // 按状态筛选
  if (filterStatus.value === 'installed') {
    result = result.filter(s => s.installed && !s.isDisabled)
  } else if (filterStatus.value === 'uninstalled') {
    result = result.filter(s => !s.installed && !s.isDisabled)
  } else if (filterStatus.value === 'disabled') {
    result = result.filter(s => s.isDisabled)
  } else if (filterStatus.value === 'repository') {
    result = result.filter(s => s.repoOwner || s.source?.type === 'repository')
  }

  // 按平台筛选 (仅在非 Drawer 模式)
  if (selectedPlatforms.value.length > 0) {
    result = result.filter(s => {
      if (!s.installed) return filterStatus.value !== 'installed'
      return s.installedPlatforms?.some(p => selectedPlatforms.value.includes(p))
    })
  }

  // 按搜索词筛选
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(s =>
      s.name?.toLowerCase().includes(query) ||
      s.description?.toLowerCase().includes(query) ||
      s.directory?.toLowerCase().includes(query)
    )
  }

  // 已安装的排在前面
  result = [...result].sort((a, b) => {
    if (a.installed && !b.installed) return -1
    if (!a.installed && b.installed) return 1
    return 0
  })

  return result
})

const emptyText = computed(() => {
  if (searchQuery.value) return '没有匹配的技能'
  if (filterStatus.value === 'installed') return '暂无已安装的技能'
  if (filterStatus.value === 'uninstalled') return '所有技能都已安装'
  if (filterStatus.value === 'disabled') return '暂无已禁用的技能'
  if (filterStatus.value === 'repository') return '暂无仓库技能'
  return '暂无可用技能，请配置仓库源'
})

async function loadPlatforms() {
  try {
    const result = await getPlatforms()
    if (result.success) {
      platforms.value = result.platforms || []
      selectedPlatforms.value = platforms.value
        .filter(p => p.exists)
        .map(p => p.id)
    }
  } catch (err) {
    console.error('加载平台列表失败:', err)
  }
}

async function loadSkills(forceRefresh = false) {
  loading.value = true
  try {
    const result = await getSkills(forceRefresh)
    if (result.success) {
      skills.value = (result.skills || []).map(skill => ({
        ...skill,
        isDisabled: Boolean(skill.isDisabled)
      }))
      globalSkills.value = skills.value
      globalSkillsLoaded.value = true
      repoWarnings.value = Array.isArray(result.warnings) ? result.warnings : []
      scheduleWarningClear()
    }
  } catch (err) {
    message.error('加载技能列表失败: ' + err.message)
    handleDismissWarnings()
  } finally {
    loading.value = false
  }
}

function clearWarningTimer() {
  if (warningTimer) {
    clearTimeout(warningTimer)
    warningTimer = null
  }
}

function scheduleWarningClear() {
  clearWarningTimer()
  if (repoWarnings.value.length === 0) return
  warningTimer = setTimeout(() => {
    repoWarnings.value = []
    warningTimer = null
  }, 8000)
}

function handleDismissWarnings() {
  clearWarningTimer()
  repoWarnings.value = []
}

function handleRefresh() {
  loadSkills(true)
  loadPlatforms()
}

// 缓存失败降级逻辑封装
async function withCacheFallback(action, skill, successMsg) {
  const key = getSkillKey(skill)
  actionLoadingKeys.value[key] = true
  try {
    const result = await action(skill.directory, false)
    if (result.success) {
      message.success(successMsg)
      await loadSkills(true)
      emit('updated')
      return true
    } else if (result.fallbackAvailable) {
      return new Promise((resolve) => {
        dialog.warning({
          title: '缓存失败',
          content: result.error || '操作缓存失败，是否跳过缓存并继续？',
          positiveText: '跳过缓存继续',
          negativeText: '取消',
          onPositiveClick: async () => {
            try {
              const retryResult = await action(skill.directory, true)
              if (retryResult.success) {
                message.success(successMsg)
                await loadSkills(true)
                emit('updated')
                resolve(true)
              } else {
                message.error(retryResult.error || '操作失败')
                resolve(false)
              }
            } catch (err) {
              message.error('操作失败: ' + err.message)
              resolve(false)
            }
          },
          onNegativeClick: () => resolve(false)
        })
      })
    } else {
      message.error(result.error || '操作失败')
      return false
    }
  } catch (err) {
    message.error('操作异常: ' + err.message)
    return false
  } finally {
    delete actionLoadingKeys.value[key]
  }
}

function handleInstall(skill) {
  if (!skill.installed && (!skill.repoOwner || !skill.repoName)) {
    message.error('缺少仓库信息，无法安装')
    return
  }
  platformModalSkill.value = skill
  platformModalMode.value = 'install'
  showPlatformModal.value = true
}

function handleUninstall(skill) {
  platformModalSkill.value = skill
  platformModalMode.value = 'uninstall'
  showPlatformModal.value = true
}

async function handleDisable(skill) {
  await withCacheFallback(disableSkill, skill, `技能 "${skill.name}" 已禁用`)
}

async function handleEnable(skill) {
  const key = getSkillKey(skill)
  actionLoadingKeys.value[key] = true
  try {
    const result = await enableSkill(skill.directory)
    if (result.success) {
      message.success(`技能 "${skill.name}" 已启用`)
      await loadSkills(true)
      emit('updated')
    } else {
      message.error(result.error || '操作失败')
    }
  } catch (err) {
    message.error('操作失败: ' + err.message)
  } finally {
    delete actionLoadingKeys.value[key]
  }
}

async function handleDelete(skill) {
  dialog.warning({
    title: '确认删除',
    content: `确定要彻底删除技能 "${skill.name}" 的本地缓存吗？`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const key = getSkillKey(skill)
      actionLoadingKeys.value[key] = true
      try {
        const result = await deleteCachedSkill(skill.directory)
        if (result.success) {
          message.success(`技能 "${skill.name}" 缓存已删除`)
        } else if (result.code === 'CACHE_NOT_FOUND') {
          message.success('删除成功（缓存不存在）')
        } else {
          message.error(result.error || '删除失败')
          return
        }
        await loadSkills(true)
        emit('updated')
      } catch (err) {
        message.error('删除异常: ' + err.message)
      } finally {
        delete actionLoadingKeys.value[key]
      }
    }
  })
}

async function handleReinstall(skill) {
  const key = getSkillKey(skill)
  actionLoadingKeys.value[key] = true
  try {
    const result = await reinstallSkill(skill.directory)
    if (result.success) {
      message.success(`技能 "${skill.name}" 已重新安装`)
      await loadSkills(true)
      emit('updated')
    } else {
      message.error(result.error || '重新安装失败')
    }
  } catch (err) {
    message.error('重新安装失败: ' + err.message)
  } finally {
    delete actionLoadingKeys.value[key]
  }
}

function handleOpenUpdateSource(skill) {
  updateSourceSkill.value = skill
  showUpdateSourceModal.value = true
}

async function handleUpdateSourceSaved() {
  await loadSkills(true)
  emit('updated')
}

async function handleCreateComplete() {
  showCreateModal.value = false
  showUploadModal.value = false
  await loadSkills(true)
  emit('updated')
}

async function handleManualUpdate(skill) {
  const key = getSkillKey(skill)
  actionLoadingKeys.value[key] = true
  try {
    const result = await updateSkill(skill.directory)
    if (result.success) {
      message.success(`技能 "${skill.name}" 已更新`)
      await loadSkills(true)
      emit('updated')
    } else {
      message.error(result.error || '更新失败')
    }
  } catch (err) {
    message.error('更新失败: ' + err.message)
  } finally {
    delete actionLoadingKeys.value[key]
  }
}

async function handleUploadComplete(result) {
  await loadSkills(true)
  emit('updated')
  if (result?.directory) {
    pendingUploadSkill.value = {
      directory: result.directory,
      name: result.metadata?.name || result.directory,
      installedPlatforms: result.installedPlatforms || []
    }
    platformModalSkill.value = pendingUploadSkill.value
    platformModalMode.value = 'upload'
    showPlatformModal.value = true
  }
}

async function confirmPlatformSelection(selectedPlatforms) {
  const skill = platformModalSkill.value
  const mode = platformModalMode.value
  showPlatformModal.value = false

  if (mode === 'upload') {
    if (!skill?.directory) return
    const key = getSkillKey(skill)
    actionLoadingKeys.value[key] = true
    try {
      const allPlatforms = platforms.value.map(p => p.id)
      const unselected = allPlatforms.filter(id => !selectedPlatforms.includes(id))
      const installResult = await installSkill(skill.directory, null, selectedPlatforms)
      if (!installResult.success) {
        message.error(installResult.error || '安装失败')
        return
      }
      if (unselected.length > 0) {
        await uninstallSkill(skill.directory, unselected, true)
      }
      message.success(`技能 "${skill.name}" 已按选择安装`)
      await loadSkills(true)
      emit('updated')
    } catch (err) {
      message.error('安装异常: ' + err.message)
    } finally {
      delete actionLoadingKeys.value[key]
      pendingUploadSkill.value = null
    }
  } else if (mode === 'install') {
    const repo = skill.repoOwner ? {
      owner: skill.repoOwner,
      name: skill.repoName,
      branch: skill.repoBranch || 'main'
    } : null
    
    const key = getSkillKey(skill)
    actionLoadingKeys.value[key] = true
    try {
      const result = await installSkill(skill.directory, repo, selectedPlatforms)
      if (result.success) {
        message.success(`技能 "${skill.name}" 安装成功`)
        await loadSkills(true)
        emit('updated')
      } else {
        message.error(result.error || '安装失败')
      }
    } catch (err) {
      message.error('安装异常: ' + err.message)
    } finally {
      delete actionLoadingKeys.value[key]
    }
  } else {
    await withCacheFallback(
      (dir, skip) => uninstallSkill(dir, selectedPlatforms, skip),
      skill,
      `技能 "${skill.name}" 已从指定平台卸载`
    )
  }
}

function togglePlatform(platformId) {
  const index = selectedPlatforms.value.indexOf(platformId)
  if (index > -1) {
    selectedPlatforms.value.splice(index, 1)
  } else {
    selectedPlatforms.value.push(platformId)
  }
}

function handleCardClick(skill) {
  selectedSkill.value = skill
  showDetailModal.value = true
}

function handleBack() {
  emit('back')
}

function handleOpenUpload(event) {
  lastFocusEl.value = event?.currentTarget || null
  showUploadModal.value = true
}

function handleOpenCreateFromUpload() {
  showUploadModal.value = false
  showCreateModal.value = true
}

function restoreFocus() {
  if (lastFocusEl.value && typeof lastFocusEl.value.focus === 'function') {
    lastFocusEl.value.focus()
  }
  lastFocusEl.value = null
}

onMounted(() => {
  loadPlatforms()
  loadSkills()
})

onBeforeUnmount(() => {
  clearWarningTimer()
})

watch(() => showUploadModal.value, (val) => {
  if (!val) {
    restoreFocus()
  }
})
</script>

<style scoped>
.skills-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.back-btn {
  padding: 4px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.action-btn {
  font-size: 12px;
  padding: 4px 8px;
}

.action-btn:focus-visible {
  outline: 2px solid #2080f0;
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .action-btn {
    min-height: 44px;
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
}

.filter-select {
  width: 110px;
  flex-shrink: 0;
}

.platform-filters {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.platform-filter-tag {
  padding: 4px 12px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  white-space: nowrap;
  position: relative;
}

.platform-filter-tag::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 2px;
  border-radius: 1px;
  transition: width 0.15s ease;
}

.platform-filter-tag:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.platform-filter-tag.platform-claude.active {
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.1);
}
.platform-filter-tag.platform-claude.active::after {
  width: 100%;
  background: #FF6B35;
}

.platform-filter-tag.platform-codex.active {
  color: #4CAF50;
  background: rgba(76, 175, 80, 0.1);
}
.platform-filter-tag.platform-codex.active::after {
  width: 100%;
  background: #4CAF50;
}

.platform-filter-tag.platform-gemini.active {
  color: #2196F3;
  background: rgba(33, 150, 243, 0.1);
}
.platform-filter-tag.platform-gemini.active::after {
  width: 100%;
  background: #2196F3;
}

.search-input {
  flex: 1;
}

.repo-warning {
  margin: 10px 16px 0;
}

.repo-warning-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.repo-warning-item {
  display: flex;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.repo-warning-repo {
  font-weight: 600;
  color: var(--text-primary);
}

.repo-warning-message {
  color: var(--text-secondary);
}

.skills-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.skills-content :deep(.n-spin-container) {
  min-height: 300px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.skills-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 11px;
  color: var(--text-tertiary);
  border-top: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.info-icon {
  color: var(--text-quaternary);
}

</style>
