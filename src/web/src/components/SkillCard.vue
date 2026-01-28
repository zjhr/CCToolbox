<template>
  <div
    class="skill-card"
    :class="{
      installed: skill.installed,
      'is-disabled': skill.isDisabled,
      'is-repo': isRepoSkill
    }"
    @click="emit('click', skill)"
  >
    <!-- 平台标签区域 (页签式) - 禁用状态下隐藏 -->
    <div class="platform-tabs" v-if="skill.installedPlatforms?.length && !skill.isDisabled">
      <div
        v-for="platform in skill.installedPlatforms"
        :key="platform"
        class="platform-tab"
        :style="{ backgroundColor: platformColors[platform] || '#999' }"
      >
        {{ platformNames[platform] || platform }}
      </div>
    </div>

    <div class="card-body">
      <div class="card-main">
        <div class="card-header">
          <div class="skill-name">
            <span v-if="skill.isDisabled" class="disabled-dot">🔴</span>
            {{ skill.name }}
          </div>
        <div class="skill-badges">
          <n-tag v-if="skill.repoOwner" type="info" size="tiny" :bordered="false">
            {{ skill.repoOwner }}
          </n-tag>
          <n-tag
            v-if="showUpdateStatus"
            :type="updateStatusType"
            size="tiny"
            :bordered="false"
          >
            {{ updateStatusLabel }}
          </n-tag>
        </div>
      </div>

        <div class="skill-desc" v-if="skill.description">
          {{ truncateDesc(skill.description) }}
        </div>

        <div class="skill-meta">
          <span class="meta-item" v-if="skill.directory">
            <n-icon size="12"><FolderOutline /></n-icon>
            {{ skill.directory }}
          </span>
          <a
            v-if="skill.readmeUrl"
            :href="skill.readmeUrl"
            target="_blank"
            class="meta-link"
            @click.stop
          >
            <n-icon size="12"><OpenOutline /></n-icon>
            GitHub
          </a>
        </div>
      </div>

      <div class="card-side">
        <div class="card-actions">
          <n-button
            v-if="showUpdateAction"
            size="tiny"
            type="primary"
            :loading="props.loading"
            :disabled="props.loading"
            :aria-label="`更新 ${skill.name} 技能`"
            @click.stop="emit('update', skill)"
          >
            更新
          </n-button>
          <n-button
            v-if="showReinstall"
            size="tiny"
            type="primary"
            :loading="props.loading"
            :disabled="props.loading"
            :aria-label="`重新安装 ${skill.name} 技能`"
            @click.stop="emit('reinstall', skill)"
          >
            重新安装
          </n-button>

          <!-- 正常安装按钮 -->
          <n-button
            v-if="!skill.isDisabled && (skill.installed || skill.repoOwner) && (skill.installedPlatforms?.length || 0) < 3"
            size="tiny"
            type="primary"
            :loading="props.loading"
            :disabled="props.loading || (!skill.installed && !skill.repoOwner)"
            @click.stop="handleInstall"
          >
            安装
          </n-button>

          <!-- 已安装 -> 显示禁用 -->
          <n-button
            v-if="skill.installed && !skill.isDisabled"
            size="tiny"
            tertiary
            type="warning"
            :loading="props.loading"
            :disabled="props.loading"
            @click.stop="emit('disable', skill)"
          >
            禁用
          </n-button>

          <!-- 已禁用 -> 显示启用 -->
          <n-button
            v-if="skill.isDisabled"
            size="tiny"
            type="primary"
            :loading="props.loading"
            :disabled="props.loading"
            @click.stop="emit('enable', skill)"
          >
            启用
          </n-button>

          <!-- 已禁用且非仓库源 -> 显示删除 -->
          <n-button
            v-if="showDeleteCache"
            size="tiny"
            tertiary
            type="error"
            :loading="props.loading"
            :disabled="props.loading"
            @click.stop="emit('delete', skill)"
          >
            {{ deleteLabel }}
          </n-button>

          <!-- 卸载按钮（仅在未禁用且已安装时显示） -->
          <n-button
            v-if="skill.installed && !skill.isDisabled"
            size="tiny"
            tertiary
            type="error"
            :loading="props.loading"
            :disabled="props.loading"
            @click.stop="handleUninstall"
          >
            卸载
          </n-button>

          <n-button
            v-if="showUpdateConfig"
            size="tiny"
            text
            :disabled="props.loading"
            aria-label="设置更新"
            @click.stop="emit('configure-update', skill)"
          >
            设置更新
          </n-button>
        </div>

        <div
          v-if="showReinstall"
          class="card-countdown"
          :style="{ color: reinstallCountdownColor }"
          :aria-label="reinstallCountdownText"
        >
          {{ reinstallCountdownText }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NButton, NTag, NIcon } from 'naive-ui'
import { FolderOutline, OpenOutline } from '@vicons/ionicons5'

const props = defineProps({
  skill: {
    type: Object,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const platformColors = {
  claude: '#FF6B35',
  codex: '#4CAF50',
  gemini: '#2196F3'
}

const platformNames = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini'
}

const emit = defineEmits([
  'install',
  'uninstall',
  'disable',
  'enable',
  'delete',
  'reinstall',
  'update',
  'configure-update',
  'click'
])

const isRepoSkill = computed(() => Boolean(props.skill?.repoOwner || props.skill?.source?.type === 'repository'))
const timeLeftMs = ref(0)

function truncateDesc(desc) {
  if (!desc) return ''
  return desc.length > 100 ? desc.slice(0, 100) + '...' : desc
}

function handleInstall() {
  emit('install', props.skill)
}

function handleUninstall() {
  emit('uninstall', props.skill)
}

const reinstallExpiresAt = computed(() => {
  if (!props.skill?.reinstallExpiresAt) return null
  const timestamp = new Date(props.skill.reinstallExpiresAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
})

const canReinstall = computed(() => Boolean(props.skill?.canReinstall) && !props.skill?.installed)

const showReinstall = computed(() => canReinstall.value && timeLeftMs.value > 0)

const updateInfo = computed(() => props.skill?.update || null)
const hasUpdateSource = computed(() => Boolean(updateInfo.value?.repoOwner && updateInfo.value?.repoName))
const showUpdateConfig = computed(() => !isRepoSkill.value)
const showUpdateAction = computed(() => (
  showUpdateConfig.value
  && Boolean(updateInfo.value?.hasUpdate)
  && Boolean(props.skill?.installed)
))
const showUpdateStatus = computed(() => (
  showUpdateConfig.value && Boolean(updateStatusLabel.value)
))

const updateStatusLabel = computed(() => {
  if (!showUpdateConfig.value) return ''
  if (!hasUpdateSource.value) return '未配置更新'
  if (updateInfo.value?.error) return '检测失败'
  if (updateInfo.value?.hasUpdate) return '有更新'
  if (updateInfo.value?.lastCheckedAt) return '已是最新'
  return '待检测'
})

const updateStatusType = computed(() => {
  if (!showUpdateConfig.value) return 'default'
  if (!hasUpdateSource.value) return 'default'
  if (updateInfo.value?.error) return 'warning'
  if (updateInfo.value?.hasUpdate) return 'error'
  return updateInfo.value?.lastCheckedAt ? 'success' : 'warning'
})

const isReinstallExpired = computed(() => Boolean(reinstallExpiresAt.value) && timeLeftMs.value <= 0)

const reinstallCountdownText = computed(() => {
  if (!showReinstall.value) return ''
  const totalMinutes = Math.max(0, Math.ceil(timeLeftMs.value / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `可重新安装:剩余 ${hours} 小时 ${minutes} 分`
})

const reinstallCountdownColor = computed(() => (
  timeLeftMs.value > 60 * 60 * 1000 ? '#4CAF50' : '#FF9800'
))

const showDeleteCache = computed(() => {
  if (props.skill?.isDisabled) return true
  if (!props.skill?.installed && props.skill?.cacheAvailable) return true
  return false
})

const deleteLabel = computed(() => (
  props.skill?.isDisabled ? '删除' : '删除缓存'
))

function updateCountdown() {
  if (!reinstallExpiresAt.value) {
    timeLeftMs.value = 0
    return
  }
  timeLeftMs.value = Math.max(0, reinstallExpiresAt.value - Date.now())
}

watch(
  () => [props.skill?.reinstallExpiresAt, props.skill?.canReinstall, props.skill?.installed],
  (values, oldValues, onCleanup) => {
    updateCountdown()
    if (canReinstall.value && reinstallExpiresAt.value) {
      const timer = setInterval(updateCountdown, 60 * 1000)
      onCleanup(() => clearInterval(timer))
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.skill-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  transition: all 0.15s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.skill-card:hover {
  border-color: #18a058;
  background: var(--bg-tertiary);
  box-shadow: 0 4px 12px rgba(24, 160, 88, 0.1);
}

.skill-card.installed {
  border-left: 3px solid #18a058;
}

.skill-card.is-repo:not(.installed) {
  border-left: 3px solid rgba(59, 130, 246, 0.6);
}

.skill-card.is-disabled {
  opacity: 0.7;
  background: var(--bg-primary);
  border-left: 3px solid #999;
}

.disabled-dot {
  margin-right: 4px;
  font-size: 10px;
}

.skill-card.is-disabled .skill-name {
  color: var(--text-tertiary);
}

.platform-tabs {
  display: flex;
  gap: 4px;
  padding: 0 12px;
}

.platform-tab {
  padding: 2px 8px;
  font-size: 10px;
  font-weight: bold;
  color: #fff;
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  line-height: 1.2;
  text-transform: capitalize;
}

.card-body {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.skill-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.skill-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-link {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-tertiary);
  text-decoration: none;
  transition: color 0.15s;
}

.meta-link:hover {
  color: #18a058;
}

.card-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}

.card-actions :deep(.n-button):focus-visible {
  outline: 2px solid #2080f0;
  outline-offset: 2px;
}

.card-countdown {
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

/* ========== 响应式样式 ========== */

/* 小屏幕 (640px - 768px) */
@media (max-width: 768px) {
  .card-body {
    padding: 10px 12px;
    gap: 10px;
  }

  .skill-name {
    font-size: 12px;
  }

  .skill-desc {
    font-size: 11px;
    -webkit-line-clamp: 3;
  }

  .skill-meta {
    font-size: 10px;
    gap: 8px;
  }
}

/* 移动端 (< 640px) */
@media (max-width: 640px) {
  .card-body {
    flex-direction: column;
    align-items: stretch;
    padding: 8px 10px;
    gap: 8px;
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    margin-bottom: 4px;
  }

  .skill-badges {
    align-self: flex-start;
  }

  .skill-desc {
    margin-bottom: 6px;
    font-size: 11px;
  }

  .skill-meta {
    justify-content: flex-start;
  }

  .card-side {
    width: 100%;
    align-items: flex-end;
    gap: 6px;
  }

  .card-actions {
    justify-content: center;
    width: 100%;
  }

  .card-actions :deep(.n-button) {
    min-height: 44px;
    min-width: 44px;
  }
}

/* 超小屏幕 (< 480px) */
@media (max-width: 480px) {
  .card-body {
    padding: 6px 8px;
  }

  .skill-name {
    font-size: 11px;
  }

  .skill-desc {
    font-size: 10px;
    line-height: 1.4;
  }

  .skill-meta {
    font-size: 9px;
    gap: 6px;
  }

  .card-actions :deep(.n-button) {
    font-size: 10px;
    min-height: 44px;
    min-width: 44px;
  }
}
</style>
