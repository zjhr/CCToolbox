<template>
  <div class="right-panel">
    <!-- 上半部分：API 渠道管理 -->
    <div v-if="showChannels" class="channels-section" :class="{ 'full-height': !showLogs || !proxyRunning }">
      <!-- 动作按钮区域 -->
      <div class="actions-section">
        <div class="action-buttons">
          <!-- 左侧：代理切换 + 已安装技能数 -->
          <div class="action-left">
            <div class="action-item">
              <n-text depth="3" style="font-size: 13px; margin-right: 8px;">动态切换</n-text>
              <n-switch
                :value="proxyRunning"
                :loading="proxyLoading"
                size="small"
                @update:value="handleProxyToggle"
              />
            </div>
            <n-tag v-if="installedSkillsCount > 0" type="success" size="small" :bordered="false" class="skills-count-tag">
              已安装 {{ installedSkillsCount }} 个技能
            </n-tag>
          </div>

          <!-- 右侧：图标按钮 -->
          <div class="action-right">
            <!-- 最近对话 -->
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button
                  text
                  size="small"
                  @click="handleShowRecent"
                  class="recent-sessions-icon-btn"
                >
                  <template #icon>
                    <n-icon :size="18"><ChatbubblesOutline /></n-icon>
                  </template>
                </n-button>
              </template>
              最新对话
            </n-tooltip>
          </div>
        </div>
      </div>

      <!-- 固定的标题栏 -->
      <div class="panel-header">
        <div class="header-title">
          <h3>{{ channelTitle }}</h3>
          <div v-if="activeChannel || showReasoningEffort" class="channel-quick">
            <div
              v-if="activeChannel"
              class="channel-tag"
              :class="{ clickable: canOpenActiveWebsite }"
              @click="handleOpenActiveWebsite"
            >
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-tag size="small" type="info" :bordered="false">
                    {{ activeChannel.name || '未命名渠道' }}
                  </n-tag>
                </template>
                正在使用的渠道
              </n-tooltip>
              <n-button text size="tiny" class="edit-button" @click.stop="handleEditActiveChannel">
                <n-icon size="14" aria-hidden="true"><CreateOutline /></n-icon>
              </n-button>
            </div>
            <n-text v-else depth="3" class="no-active-channel">无活跃渠道</n-text>
            <div v-if="showReasoningEffort" class="reasoning-effort">
              <n-popover
                trigger="click"
                placement="bottom-start"
                :disabled="!activeChannel"
                :show="modelSelectorVisible"
                @update:show="handleModelSelectorVisibleChange"
              >
                <template #trigger>
                  <n-tag
                    size="small"
                    type="success"
                    :bordered="false"
                    class="model-selector-tag"
                    :class="{ disabled: !activeChannel }"
                  >
                    {{ modelSelectorTagText }}
                  </n-tag>
                </template>
                <div class="model-selector-popover">
                  <n-text depth="3" class="selector-label">模型选择</n-text>
                  <n-select
                    size="small"
                    filterable
                    tag
                    :value="draftModelName"
                    :options="modelPresetOptions"
                    :loading="hierarchicalSaving"
                    placeholder="请选择或输入模型"
                    @update:value="handleModelNameSelectChange"
                  />
                  <n-text depth="3" class="selector-label">推理强度</n-text>
                  <n-select
                    size="small"
                    :value="draftReasoningEffort"
                    :options="reasoningEffortOptions"
                    :loading="hierarchicalSaving"
                    @update:value="handleReasoningEffortSelectChange"
                  />
                </div>
              </n-popover>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                text
                size="small"
                @click="handleToggleAllCollapse"
                class="toggle-collapse-btn"
              >
                <template #icon>
                  <n-icon :size="16"><ChevronDownOutline /></n-icon>
                </template>
              </n-button>
            </template>
            全部展开/收起
          </n-tooltip>

          <n-button type="primary" size="small" @click="handleAddClick">
            <template #icon>
              <n-icon><AddOutline /></n-icon>
            </template>
            添加渠道
          </n-button>

          <n-tooltip v-if="currentChannel === 'gemini'" :disabled="!showGeminiClearTooltip">
            <template #trigger>
              <span>
                <n-button
                  size="small"
                  type="error"
                  secondary
                  :disabled="!geminiCanClearConfig"
                  :aria-disabled="!geminiCanClearConfig"
                  @click="handleClearGeminiConfig"
                >
                  清空配置
                </n-button>
              </span>
            </template>
            {{ geminiClearTooltip }}
          </n-tooltip>
        </div>
      </div>

      <!-- 可滚动的渠道列表区域 -->
      <div class="channels-scroll-area">
        <!-- Claude 渠道列表 -->
        <template v-if="currentChannel === 'claude'">
          <ClaudeChannelPanel ref="claudePanelRef" @open-website="openWebsite" />
        </template>

        <template v-else-if="currentChannel === 'codex'">
          <CodexChannelPanel ref="codexPanelRef" @open-website="openWebsite" />
        </template>
        <template v-else-if="currentChannel === 'gemini'">
          <GeminiChannelPanel
            ref="geminiPanelRef"
            @open-website="openWebsite"
            @clear-config-state="handleGeminiClearState"
          />
        </template>
      </div>
    </div>

    <!-- 下半部分：实时日志（用户开启日志显示时显示） -->
    <div
      v-if="showLogs"
      class="logs-section"
      :class="{ 'full-height': !showChannels }"
    >
      <ProxyLogs :source="currentChannel" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  NButton, NIcon, NText, NSwitch, NTooltip, NTag, NSelect, NPopover
} from 'naive-ui'
import { AddOutline, ChatbubblesOutline, ChevronDownOutline, CreateOutline } from '@vicons/ionicons5'
import ClaudeChannelPanel from './channel/ClaudeChannelPanel.vue'
import CodexChannelPanel from './channel/CodexChannelPanel.vue'
import GeminiChannelPanel from './channel/GeminiChannelPanel.vue'
import ProxyLogs from './ProxyLogs.vue'
import { useGlobalStore } from '../stores/global'
import { getSkills } from '../api/skills'
import { updateCodexChannel, updateReasoningEffort, writeCodexConfig } from '../api/channels'
import message from '../utils/message'

const route = useRoute()
const globalStore = useGlobalStore()

// Props for panel visibility
defineProps({
  showChannels: {
    type: Boolean,
    default: true
  },
  showLogs: {
    type: Boolean,
    default: true
  },
  proxyRunning: {
    type: Boolean,
    default: false
  },
  proxyLoading: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['proxy-toggle', 'show-recent'])

// Get current channel from route
const currentChannel = computed(() => route.meta.channel || 'claude')

const claudePanelRef = ref(null)
const codexPanelRef = ref(null)
const geminiPanelRef = ref(null)
const geminiCanClearConfig = ref(false)
const installedSkillsCount = ref(0)
const geminiClearTooltip = computed(() => geminiPanelRef.value?.getClearButtonTooltip?.() || '')
const showGeminiClearTooltip = computed(() => geminiCanClearConfig.value && Boolean(geminiClearTooltip.value))


// 加载已安装技能数量
async function loadInstalledSkillsCount() {
  try {
    const result = await getSkills()
    if (result.success && result.skills) {
      const platformId = currentChannel.value
      installedSkillsCount.value = result.skills.filter(s => {
        if (!s.installed) return false
        if (!Array.isArray(s.installedPlatforms)) return false
        return s.installedPlatforms.includes(platformId)
      }).length
    }
  } catch (err) {
    console.error('Failed to load skills count:', err)
  }
}

const channelRefs = {
  claude: claudePanelRef,
  codex: codexPanelRef,
  gemini: geminiPanelRef
}

const channelTitles = {
  claude: 'Claude 渠道管理',
  codex: 'Codex 渠道管理',
  gemini: 'Gemini 渠道管理'
}

const channelTitle = computed(() => channelTitles[currentChannel.value] || 'Claude 渠道管理')

const currentPanelRef = computed(() => channelRefs[currentChannel.value]?.value || null)
const activeChannel = computed(() => currentPanelRef.value?.getActiveChannel?.() || null)
const canOpenActiveWebsite = computed(() => Boolean(activeChannel.value?.websiteUrl))
const showReasoningEffort = computed(() => currentChannel.value === 'codex')
const currentModelName = computed(() => activeChannel.value?.modelName || 'gpt-5.5')
const panelReasoningEffort = computed(() => currentPanelRef.value?.getReasoningEffort?.() || 'high')
const reasoningEffortOptions = computed(() => currentPanelRef.value?.getReasoningEffortOptions?.() || [
  { label: 'xhigh', value: 'xhigh' },
  { label: 'high', value: 'high' },
  { label: 'medium', value: 'medium' },
  { label: 'low', value: 'low' }
])
const modelPresetOptions = [
  { label: 'gpt-5.3', value: 'gpt-5.3' },
  { label: 'gpt-5.3-codex', value: 'gpt-5.3-codex' },
  { label: 'gpt-5.4', value: 'gpt-5.4' },
  { label: 'gpt-5.5', value: 'gpt-5.5' }
]
const modelSelectorVisible = ref(false)
const draftModelName = ref('gpt-5.5')
const draftReasoningEffort = ref('high')
const currentReasoningEffort = ref('high')
const modelSelectionTouched = ref(false)
const reasoningSelectionTouched = ref(false)
const hierarchicalSaving = ref(false)
const isHierarchicalDirty = computed(() => modelSelectionTouched.value || reasoningSelectionTouched.value)
const modelSelectorTagText = computed(() => `${currentModelName.value}/${currentReasoningEffort.value}`)

function openWebsite(url) {
  window.open(url, '_blank')
}

function handleOpenActiveWebsite() {
  if (!canOpenActiveWebsite.value || !activeChannel.value?.websiteUrl) return
  openWebsite(activeChannel.value.websiteUrl)
}

function handleEditActiveChannel() {
  currentPanelRef.value?.editActiveChannel?.()
}

function syncModelSelectorDraft(resetTouched = false) {
  draftModelName.value = currentModelName.value
  draftReasoningEffort.value = currentReasoningEffort.value
  if (resetTouched) {
    modelSelectionTouched.value = false
    reasoningSelectionTouched.value = false
  }
}

async function persistHierarchicalSelection() {
  if (!showReasoningEffort.value || !activeChannel.value?.id || hierarchicalSaving.value) return

  const activeChannelId = activeChannel.value.id
  const panelRef = currentPanelRef.value
  const modelName = draftModelName.value.trim()
  const effort = draftReasoningEffort.value
  if (!modelName || !effort) return

  const modelChanged = modelName !== currentModelName.value
  const effortChanged = effort !== currentReasoningEffort.value
  if (!modelChanged && !effortChanged) {
    modelSelectionTouched.value = false
    reasoningSelectionTouched.value = false
    return
  }

  hierarchicalSaving.value = true
  try {
    if (modelChanged) {
      await updateCodexChannel(activeChannelId, { modelName })
    }
    if (effortChanged) {
      await updateReasoningEffort(effort)
      currentReasoningEffort.value = effort
    }
    if (modelChanged) {
      await writeCodexConfig(activeChannelId)
    }
    // 先保证配置落盘，再刷新面板，避免刷新过程干扰写配置链路
    try {
      await panelRef?.refresh?.()
    } catch (refreshErr) {
      console.warn('刷新渠道面板失败，但配置已保存：', refreshErr)
    }
    modelSelectionTouched.value = false
    reasoningSelectionTouched.value = false
    message.success('模型和推理强度已更新')
  } catch (err) {
    message.error(`模型或推理强度保存失败：${err?.message || '未知错误'}`)
    syncModelSelectorDraft(true)
  } finally {
    hierarchicalSaving.value = false
  }
}

function handleModelSelectorVisibleChange(show) {
  modelSelectorVisible.value = show
  if (show) {
    syncModelSelectorDraft(true)
    return
  }
  if (isHierarchicalDirty.value) {
    persistHierarchicalSelection()
  }
}

function handleModelNameSelectChange(value) {
  const normalizedValue = (typeof value === 'string' ? value : String(value || '')).trim()
  if (!normalizedValue) return
  draftModelName.value = normalizedValue
  modelSelectionTouched.value = true
  if (reasoningSelectionTouched.value) {
    persistHierarchicalSelection()
  }
}

function handleReasoningEffortSelectChange(value) {
  if (!value) return
  draftReasoningEffort.value = value
  reasoningSelectionTouched.value = true
  if (modelSelectionTouched.value) {
    persistHierarchicalSelection()
  }
}

function handleAddClick() {
  channelRefs[currentChannel.value]?.value?.openAddDialog?.()
}

function handleToggleAllCollapse() {
  channelRefs[currentChannel.value]?.value?.toggleAllCollapse?.()
}

function handleClearGeminiConfig() {
  geminiPanelRef.value?.clearConfig?.()
}

function handleGeminiClearState(value) {
  geminiCanClearConfig.value = Boolean(value)
}

// 处理代理切换
function handleProxyToggle(value) {
  emit('proxy-toggle', value)
}

// 处理显示最近对话
function handleShowRecent() {
  emit('show-recent')
}

onMounted(() => {
  loadInstalledSkillsCount()
})

function refreshChannel(channel) {
  channelRefs[channel]?.value?.refresh?.()
}

watch(() => currentChannel.value, (value) => {
  refreshChannel(value)
  loadInstalledSkillsCount()
})
watch(() => currentChannel.value, (value) => {
  if (value !== 'gemini') {
    geminiCanClearConfig.value = false
  }
})
watch(
  () => currentChannel.value,
  () => {
    if (!showReasoningEffort.value) return
    if (modelSelectorVisible.value || hierarchicalSaving.value || isHierarchicalDirty.value) return
    currentReasoningEffort.value = panelReasoningEffort.value
    syncModelSelectorDraft(true)
  },
  { immediate: true }
)

watch(
  () => currentModelName.value,
  () => {
    if (!showReasoningEffort.value) return
    if (modelSelectorVisible.value || hierarchicalSaving.value || isHierarchicalDirty.value) return
    draftModelName.value = currentModelName.value
  }
)

watch(
  () => panelReasoningEffort.value,
  (value) => {
    if (!showReasoningEffort.value) return
    if (modelSelectorVisible.value || hierarchicalSaving.value || isHierarchicalDirty.value) return
    currentReasoningEffort.value = value
    draftReasoningEffort.value = value
  },
  { immediate: true }
)
</script>

<style scoped>
.right-panel {
  width: 520px;
  min-width: 520px;
  border-left: 1px solid var(--border-primary);
  background: var(--gradient-bg);
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.03);
}

/* 动作按钮区域 */
.actions-section {
  flex-shrink: 0;
  padding: 16px 18px 12px 18px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--gradient-card);
}

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-item :deep(.n-switch) {
  flex-shrink: 0;
}

.action-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.skills-count-tag {
  font-size: 11px;
}

.recent-sessions-icon-btn {
  padding: 6px !important;
  border-radius: 8px;
  transition: all 0.2s ease;
  color: var(--text-secondary);
}

.recent-sessions-icon-btn:hover {
  background: var(--hover-bg);
  color: #18a058;
  transform: scale(1.1);
}

[data-theme="dark"] .recent-sessions-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #34d399;
}

/* 上半部分：API 渠道管理 */
.channels-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: flex 0.3s ease-out, min-height 0.3s ease-out, max-height 0.3s ease-out;
}

/* 当渠道列表占据全部高度时（日志面板隐藏或代理未运行） */
.channels-section.full-height {
  flex: 1;
  min-height: 0;
  max-height: none;
}

/* 固定的标题栏 */
.panel-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 18px 16px 18px;
  background: var(--gradient-card);
  border-bottom: 1px solid var(--border-primary);
  position: relative;
}

.panel-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(24, 160, 88, 0.08), transparent);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.channel-quick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.channel-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.channel-tag.clickable {
  cursor: pointer;
}

.channel-tag.clickable :deep(.n-tag) {
  cursor: pointer;
}

.channel-tag.clickable:active {
  transform: translateY(1px);
}

.channel-tag.clickable:active :deep(.n-tag) {
  background: var(--n-primary-color-suppl, rgba(24, 160, 88, 0.15));
}

.channel-tag.clickable :deep(.n-tag:active) {
  transform: translateY(1px);
  background: var(--n-primary-color-suppl, rgba(24, 160, 88, 0.15));
}

.channel-tag .edit-button {
  opacity: 1;
  transform: translateX(0);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.reasoning-effort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.model-selector-tag {
  cursor: pointer;
  font-weight: 600;
}

.model-selector-tag.disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.model-selector-popover {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.selector-label {
  font-size: 12px;
  font-weight: 600;
}

.model-selector-popover :deep(.n-select) {
  width: 100%;
}

.no-active-channel {
  font-size: 12px;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-collapse-btn {
  padding: 6px !important;
  border-radius: 8px;
  transition: all 0.2s ease;
  color: var(--text-secondary);
}

.toggle-collapse-btn:hover {
  background: var(--hover-bg);
  color: #18a058;
  transform: scale(1.05);
}

[data-theme="dark"] .toggle-collapse-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #34d399;
}

/* 可滚动的渠道列表区域 */
.channels-scroll-area {
  flex: 1;
  min-height: 0;
  padding: 0 12px 12px;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-primary);
}

/* 下半部分：实时日志 */
.logs-section {
  flex: 0 0 400px;
  min-height: 400px;
  max-height: 400px;
  overflow: hidden;
  transition: flex 0.3s ease-out, min-height 0.3s ease-out, max-height 0.3s ease-out;
}

/* 当日志面板占据全部高度时（渠道列表隐藏） */
.logs-section.full-height {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.panel-header :deep(.n-button--primary-type) {
  border-radius: 8px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.25);
}

.panel-header :deep(.n-button--primary-type:hover) {
  box-shadow: 0 4px 12px rgba(24, 160, 88, 0.35);
  transform: translateY(-1px);
}

/* ========== 响应式样式 ========== */

/* 平板端 (768px - 1024px) */
@media (max-width: 1024px) {
  .right-panel {
    width: 480px;
    min-width: 480px;
  }

  .actions-section {
    padding: 14px 16px 10px 16px;
  }

  .panel-header {
    padding: 16px;
  }

  .panel-header::after {
    left: 16px;
    right: 16px;
  }

  .channels-scroll-area {
    padding: 0 10px 10px;
  }

  .logs-section {
    flex: 0 0 350px;
    min-height: 350px;
    max-height: 350px;
  }
}

/* 小屏幕 (640px - 768px) */
@media (max-width: 768px) {
  .right-panel {
    width: 100%;
    min-width: 100%;
    position: fixed;
    top: 56px;
    right: 0;
    z-index: 9;
    box-shadow: -2px 0 16px rgba(0, 0, 0, 0.1);
  }

  .actions-section {
    padding: 12px 14px 8px 14px;
  }

  .action-buttons {
    gap: 8px;
  }

  .action-left {
    gap: 8px;
  }

  .action-left :deep(.n-text) {
    font-size: 12px;
    margin-right: 6px;
  }

  .skills-count-tag {
    font-size: 10px;
  }

  .recent-sessions-icon-btn {
    padding: 4px !important;
  }

  .panel-header {
    padding: 14px;
  }

  .panel-header h3 {
    font-size: 14px;
  }

  .panel-header :deep(.n-button) {
    font-size: 12px;
    padding: 0 12px;
  }

  .panel-header::after {
    left: 14px;
    right: 14px;
  }

  .channels-scroll-area {
    padding: 0 8px 8px;
  }

  .logs-section {
    flex: 0 0 300px;
    min-height: 300px;
    max-height: 300px;
  }
}

/* 移动端 (< 640px) */
@media (max-width: 640px) {
  .right-panel {
    width: 100%;
    min-width: 100%;
    top: 52px;
  }

  .actions-section {
    padding: 10px 12px 6px 12px;
  }

  .action-buttons {
    gap: 6px;
  }

  .action-left {
    gap: 6px;
    flex-direction: column;
    align-items: flex-start;
    align-self: stretch;
  }

  .action-right {
    gap: 2px;
  }

  .action-item :deep(.n-text) {
    font-size: 11px;
    margin-right: 6px;
  }

  .skills-count-tag {
    font-size: 9px;
    align-self: flex-start;
  }

  .recent-sessions-icon-btn {
    padding: 3px !important;
  }

  .recent-sessions-icon-btn :deep(.n-icon) {
    font-size: 16px !important;
  }

  .panel-header {
    padding: 12px;
  }

  .panel-header h3 {
    font-size: 13px;
  }

  .panel-header :deep(.n-button) {
    font-size: 11px;
    padding: 0 10px;
  }

  .panel-header::after {
    left: 12px;
    right: 12px;
  }

  .channels-scroll-area {
    padding: 0 6px 6px;
  }

  .logs-section {
    flex: 0 0 250px;
    min-height: 250px;
    max-height: 250px;
  }
}

/* 超小屏幕 (< 480px) */
@media (max-width: 480px) {
  .right-panel {
    top: 48px;
  }

  .actions-section {
    padding: 8px 10px 4px 10px;
  }

  .panel-header {
    padding: 10px;
  }

  .panel-header h3 {
    font-size: 12px;
  }

  .panel-header :deep(.n-button) {
    font-size: 10px;
    padding: 0 8px;
  }

  .channels-scroll-area {
    padding: 0 4px 4px;
  }

  .logs-section {
    flex: 0 0 200px;
    min-height: 200px;
    max-height: 200px;
  }
}

</style>
