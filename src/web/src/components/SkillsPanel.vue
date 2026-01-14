<template>
  <div class="skills-panel" :class="{ 'in-drawer': props.inDrawer }">
    <!-- 头部 -->
    <div class="panel-header" v-if="!props.inDrawer">
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
        <n-button text @click="showCreateModal = true" class="action-btn">
          <template #icon>
            <n-icon><AddOutline /></n-icon>
          </template>
          创建
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

    <!-- Drawer 模式下的简化头部 -->
    <div class="drawer-header-bar" v-if="props.inDrawer">
      <div class="header-left">
        <n-tag type="info" size="small" :bordered="false">
          {{ installedCount }}/{{ skills.length }}
        </n-tag>
      </div>
      <div class="header-right">
        <n-button text @click="showCreateModal = true" class="action-btn">
          <template #icon>
            <n-icon><AddOutline /></n-icon>
          </template>
          创建
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
      <!-- 平台筛选标签 -->
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
        :options="filterOptions"
        size="small"
        class="filter-select"
      />
    </div>

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
            :key="skill.key"
            :skill="skill"
            :installing="!!installingKeys[skill.key]"
            :uninstalling="!!uninstallingKeys[skill.key]"
            @install="handleInstall"
            @uninstall="handleUninstall"
            @click="handleCardClick"
          />
        </div>
      </n-spin>
    </div>

    <!-- 提示信息 -->
    <div class="panel-footer">
      <n-icon size="14" class="info-icon"><InformationCircleOutline /></n-icon>
      <span>安装/卸载后需重启 Claude Code 生效</span>
    </div>

    <!-- 仓库管理弹窗 -->
    <SkillRepoManager
      v-model:visible="showRepoManager"
      @updated="loadSkills"
    />

    <!-- 创建技能弹窗 -->
    <SkillCreateModal
      v-model:visible="showCreateModal"
      @created="loadSkills"
    />

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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { NButton, NInput, NSelect, NIcon, NTag, NSpin, NEmpty } from 'naive-ui'
import {
  ArrowBackOutline,
  GitBranchOutline,
  RefreshOutline,
  SearchOutline,
  InformationCircleOutline,
  AddOutline,
  ExtensionPuzzleOutline
} from '@vicons/ionicons5'
import { getSkills, installSkill, uninstallSkill, getPlatforms } from '../api/skills'
import message from '../utils/message'
import SkillCard from './SkillCard.vue'
import SkillRepoManager from './SkillRepoManager.vue'
import SkillCreateModal from './SkillCreateModal.vue'
import SkillDetailModal from './SkillDetailModal.vue'
import SkillPlatformModal from './SkillPlatformModal.vue'

const props = defineProps({
  hideBack: {
    type: Boolean,
    default: false
  },
  inDrawer: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['back', 'updated'])

const skills = ref([])
const loading = ref(false)
const searchQuery = ref('')
const filterStatus = ref('all')
const platforms = ref([])
const selectedPlatforms = ref([])
const showRepoManager = ref(false)
const showCreateModal = ref(false)
const showDetailModal = ref(false)
const showPlatformModal = ref(false)
const platformModalMode = ref('install')
const platformModalSkill = ref(null)
const selectedSkill = ref(null)
const installingKeys = ref({})  // 正在安装的技能 key -> true
const uninstallingKeys = ref({})  // 正在卸载的技能 key -> true

const filterOptions = [
  { label: '全部', value: 'all' },
  { label: '已安装', value: 'installed' },
  { label: '未安装', value: 'uninstalled' }
]

const installedCount = computed(() => skills.value.filter(s => s.installed).length)

const filteredSkills = computed(() => {
  let result = skills.value

  // 按状态筛选
  if (filterStatus.value === 'installed') {
    result = result.filter(s => s.installed)
  } else if (filterStatus.value === 'uninstalled') {
    result = result.filter(s => !s.installed)
  }

  // 按平台筛选 (OR 逻辑)
  // 如果选中了平台，则显示安装在任一选中平台的技能。
  // 对于未安装的技能，如果处于“全部”或“未安装”视图，也应该显示它们。
  if (selectedPlatforms.value.length > 0) {
    result = result.filter(s => {
      // 未安装的技能不受平台筛选影响（除非在“已安装”视图下）
      if (!s.installed) return filterStatus.value !== 'installed'
      // 已安装的技能必须在选中的平台之一中
      return s.installedPlatforms?.some(p => selectedPlatforms.value.includes(p))
    })
  } else if (filterStatus.value === 'installed') {
    // 如果没有选中任何平台且处于“已安装”视图，则不显示任何内容
    result = []
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
  return '暂无可用技能，请配置仓库源'
})

async function loadPlatforms() {
  try {
    const result = await getPlatforms()
    if (result.success) {
      platforms.value = result.platforms || []
      // 默认选中所有已存在的平台
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
      skills.value = result.skills || []
    }
  } catch (err) {
    message.error('加载技能列表失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

// 强制刷新（用于刷新按钮）
function handleRefresh() {
  loadSkills(true)
  loadPlatforms()
}

function handleInstall(skill) {
  // 已安装的技能可以复制到其他平台，未安装的需要仓库信息
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

async function confirmPlatformSelection(selectedPlatforms) {
  const skill = platformModalSkill.value
  const mode = platformModalMode.value
  showPlatformModal.value = false

  if (mode === 'install') {
    installingKeys.value[skill.key] = true
    try {
      // 如果有仓库信息则从仓库安装，否则使用本地复制模式
      const repo = skill.repoOwner ? {
        owner: skill.repoOwner,
        name: skill.repoName,
        branch: skill.repoBranch || 'main'
      } : null
      const result = await installSkill(skill.directory, repo, selectedPlatforms)

      if (result.success) {
        message.success(`技能 "${skill.name}" 安装成功`)
        await loadSkills(true)
        emit('updated')
      }
    } catch (err) {
      message.error('安装失败: ' + err.message)
    } finally {
      delete installingKeys.value[skill.key]
    }
  } else {
    uninstallingKeys.value[skill.key] = true
    try {
      const result = await uninstallSkill(skill.directory, selectedPlatforms)

      if (result.success) {
        message.success(`技能 "${skill.name}" 卸载成功`)
        await loadSkills(true)
        emit('updated')
      }
    } catch (err) {
      message.error('卸载失败: ' + err.message)
    } finally {
      delete uninstallingKeys.value[skill.key]
    }
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

onMounted(() => {
  loadPlatforms()
  loadSkills()
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
}

.action-btn {
  font-size: 12px;
  padding: 4px 8px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
  flex-wrap: nowrap;
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

/* Claude 平台样式 */
.platform-filter-tag.platform-claude.active {
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.1);
}
.platform-filter-tag.platform-claude.active::after {
  width: 100%;
  background: #FF6B35;
}

/* Codex 平台样式 */
.platform-filter-tag.platform-codex.active {
  color: #4CAF50;
  background: rgba(76, 175, 80, 0.1);
}
.platform-filter-tag.platform-codex.active::after {
  width: 100%;
  background: #4CAF50;
}

/* Gemini 平台样式 */
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
  min-width: 120px;
}

.filter-select {
  width: 90px;
  flex-shrink: 0;
}

.skills-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* loading 时居中显示 */
.skills-content :deep(.n-spin-container) {
  min-height: 300px;
}

.skills-content :deep(.n-spin-container.n-spin-container--spinning) {
  display: flex;
  align-items: center;
  justify-content: center;
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

/* Drawer 模式样式 */
.skills-panel.in-drawer {
  height: 100%;
}

.drawer-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.skills-panel.in-drawer .filter-bar {
  padding: 10px 12px;
}

.skills-panel.in-drawer .skills-content {
  padding: 12px;
}

.skills-panel.in-drawer .panel-footer {
  padding: 8px 12px;
}
</style>
