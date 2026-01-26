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

      <div class="card-actions">
        <!-- 正常安装按钮 -->
        <n-button
          v-if="!skill.installed && !skill.isDisabled"
          size="tiny"
          type="primary"
          :loading="props.loading"
          :disabled="props.loading || skill.installedPlatforms?.length >= 3 || (!skill.installed && !skill.repoOwner)"
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
          v-if="skill.isDisabled && !isRepoSkill"
          size="tiny"
          tertiary
          type="error"
          :loading="props.loading"
          :disabled="props.loading"
          @click.stop="emit('delete', skill)"
        >
          删除
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
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
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

const emit = defineEmits(['install', 'uninstall', 'disable', 'enable', 'delete', 'click'])

const isRepoSkill = computed(() => Boolean(props.skill?.repoOwner || props.skill?.source?.type === 'repository'))

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
  align-items: flex-start;
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

  .card-actions {
    justify-content: center;
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
    height: 24px;
  }
}
</style>
