<template>
  <div
    class="channel-card"
    :class="{
      collapsed,
      disabled: channel.enabled === false,
      'status-frozen': channel.health?.status === 'frozen',
      'status-checking': channel.health?.status === 'checking'
    }"
  >
    <div class="channel-header">
      <div class="channel-title">
        <n-button
          text
          size="tiny"
          class="collapse-btn"
          @click.stop="$emit('toggle-collapse')"
        >
          <n-icon size="16" :class="{ collapsed }">
            <ChevronDownOutline />
          </n-icon>
        </n-button>
        <span class="channel-name">
          <template v-for="(segment, index) in nameSegments" :key="index">
            <mark v-if="segment.highlight" class="search-highlight">{{ segment.text }}</mark>
            <span v-else>{{ segment.text }}</span>
          </template>
        </span>
        <div class="channel-tags">
          <template v-for="tag in headerTags" :key="tag.text">
            <n-tag
              size="tiny"
              :type="tag.type || 'default'"
              :bordered="false"
              :color="tag.color"
              :aria-label="tag.ariaLabel"
            >
              {{ tag.text }}
            </n-tag>
          </template>
        </div>
      </div>
      <div class="channel-actions" ref="actionsRef">
        <n-button
          v-if="showApplyButton"
          size="tiny"
          type="primary"
          class="apply-btn"
          @click="$emit('apply')"
        >
          写入配置
        </n-button>
        <n-popover
          trigger="manual"
          placement="bottom-end"
          :show="showTestPanel"
          @update:show="val => showTestPanel = val"
        >
          <template #trigger>
            <n-button
              size="tiny"
              :loading="testing || modelsLoading"
              @click="handleTestClick"
            >
              <template #icon>
                <n-icon><SpeedometerOutline /></n-icon>
              </template>
              测速
            </n-button>
          </template>
          <div class="speed-test-panel">
            <div class="speed-test-label">测速模型</div>
            <n-select
              v-model:value="selectedModel"
              :options="modelOptions"
              size="small"
              filterable
              tag
              placeholder="选择或输入模型名"
              :render-label="renderModelLabel"
              @update:value="handleModelChange"
            />
            <n-button
              size="small"
              type="primary"
              block
              :loading="testing"
              :disabled="testing"
              class="speed-test-action"
              @click="runTest"
            >
              开始测速
            </n-button>
          </div>
        </n-popover>
        <n-button size="tiny" @click="$emit('edit')">
          编辑
        </n-button>
        <n-button size="tiny" type="error" @click="$emit('delete')">
          删除
        </n-button>
        <n-switch
          size="small"
          :value="channel.enabled !== false"
          @update:value="$emit('toggle-enabled', $event)"
        />
      </div>
    </div>

    <!-- 测试结果展示 -->
    <div v-if="testResult" class="test-result" :class="testResult.success ? 'success' : 'failed'">
      <div class="test-result-header">
        <span class="test-result-status">
          <n-icon v-if="testResult.success" color="#18a058"><CheckmarkCircleOutline /></n-icon>
          <n-icon v-else color="#f56c6c"><CloseCircleOutline /></n-icon>
          {{ testResult.success ? '测试成功' : '测试失败' }}
        </span>
        <div class="test-result-info">
          <span v-if="testResult.latency" class="latency">{{ testResult.latency }}ms</span>
          <span v-if="testResult.testedModel" class="tested-model">{{ testResult.testedModel }}</span>
          <span v-if="testResult.statusCode" class="status-code">HTTP {{ testResult.statusCode }}</span>
        </div>
        <n-button text size="tiny" @click="testResult = null">
          <n-icon><CloseOutline /></n-icon>
        </n-button>
      </div>
      <div v-if="testResult.error" class="test-result-error">
        {{ testResult.error }}
      </div>
    </div>

    <div v-show="!collapsed" class="channel-info">
      <div class="info-main">
        <div v-for="row in infoRows" :key="row.label" class="info-row">
          <n-text depth="3" class="label">{{ row.label }}:</n-text>
          <n-text depth="2" class="value" :class="{ mono: row.mono }">
            <template v-for="(segment, index) in getValueSegments(row.value)" :key="index">
              <mark v-if="segment.highlight" class="search-highlight">{{ segment.text }}</mark>
              <span v-else>{{ segment.text }}</span>
            </template>
          </n-text>
          <n-button
            v-if="typeof row.action === 'function'"
            size="tiny"
            text
            type="primary"
            @click="row.action()"
          >
            {{ row.actionLabel || '操作' }}
          </n-button>
        </div>
      </div>
      <div class="info-footer">
        <n-button
          v-if="channel.websiteUrl"
          text
          size="tiny"
          @click="$emit('open-website', channel.websiteUrl)"
        >
          <template #icon>
            <n-icon size="14"><OpenOutline /></n-icon>
          </template>
          前往官网
        </n-button>
        <div class="footer-spacer"></div>
        <div class="channel-meta">
          <span class="meta-item">
            权重: <span class="meta-value">{{ meta.weight }}</span>
          </span>
          <span class="meta-item">
            并发:
            <span class="meta-value" :class="{ 'meta-active': meta.concurrencyActive }">
              {{ meta.concurrencyText }}
            </span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, h, watch } from 'vue'
import { NButton, NIcon, NTag, NText, NSwitch, NPopover, NSelect } from 'naive-ui'
import { ChevronDownOutline, OpenOutline, SpeedometerOutline, CheckmarkCircleOutline, CloseCircleOutline, CloseOutline, TrashOutline } from '@vicons/ionicons5'
import { fetchChannelModels, updateCustomModels } from '../../api/channels'
import message from '../../utils/message'

const props = defineProps({
  channel: {
    type: Object,
    required: true
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  headerTags: {
    type: Array,
    default: () => []
  },
  infoRows: {
    type: Array,
    default: () => []
  },
  meta: {
    type: Object,
    default: () => ({ weight: 1, concurrencyText: '不限', concurrencyActive: false })
  },
  showApplyButton: {
    type: Boolean,
    default: false
  },
  channelType: {
    type: String,
    default: 'claude'
  },
  highlightText: {
    type: String,
    default: ''
  },
  testFn: {
    type: Function,
    default: null
  }
})

defineEmits(['toggle-collapse', 'apply', 'edit', 'delete', 'toggle-enabled', 'open-website'])

const testing = ref(false)
const testResult = ref(null)

// 模型选择相关状态
const actionsRef = ref(null)
const showTestPanel = ref(false)
const modelsLoading = ref(false)
const availableModels = ref([])
const selectedModel = ref('__auto__') // 默认使用自动模式
const localCustomModels = ref([...(props.channel.customModels || [])])
const customModelUpdating = ref(false) // 自定义模型更新锁，避免并发写回覆盖

watch(() => props.channel.customModels, (newVal) => {
  localCustomModels.value = [...(newVal || [])]
})

const modelOptions = computed(() => {
  const defaultModel = props.channel.modelConfig?.model || props.channel.modelName || props.channel.model
  const options = []

  // 自动选项（使用渠道配置的默认模型）
  options.push({
    label: defaultModel ? `自动 (${defaultModel})` : '自动',
    value: '__auto__',
    type: 'system'
  })

  // API 获取的模型列表 (API 模型)
  if (availableModels.value.length > 0) {
    const apiModels = availableModels.value.filter(m => m !== defaultModel)
    if (apiModels.length > 0) {
      options.push({
        type: 'group',
        label: 'API 模型',
        key: 'api-models',
        children: apiModels.map(m => ({ label: m, value: m, type: 'api' }))
      })
    }
  }

  // 自定义模型列表
  if (localCustomModels.value.length > 0) {
    options.push({
      type: 'group',
      label: '自定义模型',
      key: 'custom-models',
      children: localCustomModels.value.map(m => ({ label: m, value: m, type: 'custom' }))
    })
  }

  return options
})

// 渲染选项标签，显示删除按钮（仅限自定义模型）
const renderModelLabel = (option) => {
  if (option.type === 'custom') {
    return h('div', { style: 'display: flex; justify-content: space-between; align-items: center; width: 100%' }, [
      h('span', null, option.label),
      h(NButton, {
        size: 'tiny',
        quaternary: true,
        circle: true,
        style: 'margin-left: 8px',
        onClick: (e) => {
          e.stopPropagation()
          removeCustomModel(option.value)
        }
      }, { default: () => h(NIcon, null, { default: () => h(CloseOutline) }) })
    ])
  }
  return option.label
}

// 点击测速按钮：先加载模型列表，再决定行为
async function handleTestClick() {
  if (showTestPanel.value) {
    // 面板已打开，点击关闭
    showTestPanel.value = false
    return
  }

  // 加载模型列表
  if (availableModels.value.length === 0) {
    await loadModels()
  }

  // 始终弹出模型面板，支持手动输入模型
  showTestPanel.value = true
}

// 点击外部关闭弹窗
const handleClickOutside = (e) => {
  if (showTestPanel.value && actionsRef.value && !actionsRef.value.contains(e.target)) {
    // 特殊处理：如果是点击 naive-ui 的弹出层内容（含 Teleport 的 n-popover），不关闭
    if (typeof e.target.closest === 'function' && (
      e.target.closest('.n-popover') || e.target.closest('.n-popover-content') || e.target.closest('.n-select-menu') || e.target.closest('.n-base-select-menu')
    )) {
      return
    }
    showTestPanel.value = false
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleClickOutside)
})

// 处理模型选择变化，如果输入的是新模型，自动保存
async function handleModelChange(value) {
  if (customModelUpdating.value) return
  if (!value || value === '__auto__') return
  
  // 检查是否已存在
  const isApi = availableModels.value.includes(value)
  const isCustom = localCustomModels.value.includes(value)
  const isDefault = value === (props.channel.modelConfig?.model || props.channel.modelName || props.channel.model)
  
  if (!isApi && !isCustom && !isDefault) {
    // 自动保存为自定义模型
    customModelUpdating.value = true
    try {
      const newList = [...localCustomModels.value, value]
      await updateCustomModels(props.channel.id, newList, props.channelType)
      localCustomModels.value = newList
      message.success(`已添加自定义模型: ${value}`)
    } catch (err) {
      console.error('Failed to add custom model:', err)
      message.error(`添加自定义模型失败: ${err.message}`)
    } finally {
      customModelUpdating.value = false
    }
  }
}

// 删除自定义模型
async function removeCustomModel(model) {
  if (customModelUpdating.value) return
  customModelUpdating.value = true
  try {
    const newList = localCustomModels.value.filter(m => m !== model)
    await updateCustomModels(props.channel.id, newList, props.channelType)
    localCustomModels.value = newList
    if (selectedModel.value === model) {
      selectedModel.value = '__auto__'
    }
    message.success(`已删除自定义模型: ${model}`)
  } catch (err) {
    console.error('Failed to remove custom model:', err)
    message.error(`删除自定义模型失败: ${err.message}`)
  } finally {
    customModelUpdating.value = false
  }
}

const normalizedHighlight = computed(() => props.highlightText.trim())
const nameSegments = computed(() => highlightMatch(props.channel.name || '', normalizedHighlight.value))

function normalizeValue(value) {
  if (!value) return '—'
  return String(value)
}

function highlightMatch(text, query) {
  if (!text) return [{ text: '', highlight: false }]
  if (!query) return [{ text, highlight: false }]

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const segments = []
  let lastIndex = 0

  while (true) {
    const index = lowerText.indexOf(lowerQuery, lastIndex)
    if (index === -1) break
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), highlight: false })
    }
    segments.push({
      text: text.slice(index, index + query.length),
      highlight: true
    })
    lastIndex = index + query.length
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlight: false })
  }

  return segments.length > 0 ? segments : [{ text, highlight: false }]
}

function getValueSegments(value) {
  return highlightMatch(normalizeValue(value), normalizedHighlight.value)
}

async function loadModels() {
  if (availableModels.value.length > 0) return
  modelsLoading.value = true
  try {
    const data = await fetchChannelModels(props.channel.id, props.channelType)
    availableModels.value = data.models || []
  } catch {
    availableModels.value = []
  } finally {
    modelsLoading.value = false
  }
}

async function runTest() {
  if (!props.testFn) return
  testing.value = true
  testResult.value = null
  showTestPanel.value = false
  try {
    const model = selectedModel.value && selectedModel.value !== '__auto__'
      ? selectedModel.value
      : null
    const result = await props.testFn(props.channel.id, 20000, model)
    testResult.value = result
  } catch (err) {
    testResult.value = {
      success: false,
      error: err.message || '测试失败',
      latency: null,
      statusCode: null
    }
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.channel-card {
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.channel-card:hover {
  border-color: var(--border-secondary);
}

.channel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
}

.channel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.channel-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
}

.search-highlight {
  background-color: var(--search-highlight-bg, #ffe58f);
  color: var(--search-highlight-text, #d48806);
  border-radius: 2px;
  padding: 0 2px;
  font-weight: 500;
}

:global([data-theme="dark"]) .search-highlight {
  background-color: var(--search-highlight-bg-dark, rgba(255, 213, 145, 0.18));
  color: var(--search-highlight-text-dark, #ffd591);
}

.collapse-btn {
  flex-shrink: 0;
}

.collapse-btn .n-icon.collapsed {
  transform: rotate(-90deg);
}

.channel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 测试结果样式 */
.test-result {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}

.test-result.success {
  background: rgba(24, 160, 88, 0.06);
  border-left: 3px solid #18a058;
}

.test-result.failed {
  background: rgba(245, 108, 108, 0.06);
  border-left: 3px solid #f56c6c;
}

.test-result-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.test-result-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.test-result.success .test-result-status {
  color: #18a058;
}

.test-result.failed .test-result-status {
  color: #f56c6c;
}

.test-result-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.test-result-info .latency {
  font-size: 13px;
  font-family: 'SF Mono', Monaco, monospace;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
}

.test-result-info .status-code {
  font-size: 11px;
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-tertiary);
}

.test-result-info .tested-model {
  font-size: 11px;
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 3px;
}

.test-result-error {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(245, 108, 108, 0.08);
  border-radius: 4px;
  font-size: 12px;
  color: #f56c6c;
  line-height: 1.4;
  word-break: break-word;
}

.channel-info {
  padding: 12px 16px;
}

.info-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-row .label {
  min-width: 80px;
  font-size: 13px;
}

.info-row .value {
  flex: 1;
  font-size: 13px;
}

.info-row .value.mono {
  font-family: 'SF Mono', Monaco, monospace;
}

.info-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-primary);
}

.footer-spacer {
  flex: 1;
}

.channel-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
}

.meta-item {
  color: var(--text-tertiary);
}

.meta-value {
  color: var(--text-secondary);
  font-weight: 500;
}

.meta-active {
  color: #18a058;
}

/* ========== 响应式样式 ========== */

/* 测速面板样式 */
.speed-test-panel {
  min-width: 220px;
  padding: 4px 0;
}

.speed-test-label {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.speed-test-action {
  margin-top: 10px;
}

/* 平板端 (768px - 1024px) */
@media (max-width: 1024px) {
  .channel-header {
    padding: 10px 12px;
  }

  .channel-info {
    padding: 10px 12px;
  }

  .channel-actions {
    gap: 6px;
  }

  .info-row {
    gap: 8px;
  }

  .info-row .label {
    min-width: 70px;
    font-size: 12px;
  }

  .info-row .value {
    font-size: 12px;
  }

  .channel-meta {
    gap: 12px;
  }
}

/* 小屏幕 (640px - 768px) */
@media (max-width: 768px) {
  .channel-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 8px 10px;
  }

  .channel-title {
    font-size: 13px;
  }

  .channel-actions {
    justify-content: space-between;
  }

  .channel-actions :deep(.n-button) {
    font-size: 12px;
    padding: 0 8px;
  }

  .channel-info {
    padding: 8px 10px;
  }

  .info-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .info-row .label {
    min-width: auto;
  }

  .info-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-top: 8px;
  }

  .channel-meta {
    align-self: stretch;
    justify-content: space-between;
  }
}

/* 移动端 (< 640px) */
@media (max-width: 640px) {
  .channel-card {
    border-radius: 6px;
  }

  .channel-header {
    padding: 6px 8px;
  }

  .channel-name {
    font-size: 12px;
  }

  .channel-title :deep(.n-tag) {
    font-size: 10px;
  }

  .channel-info {
    padding: 6px 8px;
  }

  .info-row .label {
    font-size: 11px;
  }

  .info-row .value {
    font-size: 11px;
  }

  .channel-actions :deep(.n-button) {
    font-size: 11px;
    padding: 0 6px;
    height: 24px;
  }

  .channel-meta {
    font-size: 11px;
  }
}

/* 超小屏幕 (< 480px) */
@media (max-width: 480px) {
  .channel-header {
    padding: 4px 6px;
  }

  .channel-info {
    padding: 4px 6px;
  }

  .channel-actions {
    gap: 4px;
  }

  .channel-actions :deep(.n-button) {
    font-size: 10px;
    padding: 0 4px;
    height: 22px;
    min-width: 0;
  }
}
</style>
