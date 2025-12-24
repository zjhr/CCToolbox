<template>
  <div>
    <div v-if="state.loading" class="loading-container">
      <n-spin size="small" />
    </div>
    <div v-else>
      <div class="channel-search">
        <n-input
          :value="searchInput"
          type="search"
          clearable
          maxlength="100"
          placeholder="搜索渠道名称、API地址..."
          :input-props="{
            'aria-label': '搜索渠道',
            'aria-autocomplete': 'list',
            role: 'searchbox'
          }"
          @update:value="handleSearchInput"
          @keydown.esc="handleSearchClear"
        >
          <template #prefix>
            <n-icon aria-hidden="true"><SearchOutline /></n-icon>
          </template>
        </n-input>
        <n-text v-if="isSearching" depth="3" class="search-tip">搜索中，排序已暂停</n-text>
      </div>
      <div
        v-if="hasSearchQuery"
        class="visually-hidden"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ searchResultText }}
      </div>
      <div v-if="state.channels.length === 0" class="empty-state">
        <n-empty :description="config.emptyDescription">
          <template v-if="config.showEmptyAction" #extra>
            <n-button type="primary" size="small" @click="actions.openAddDialog">
              <template #icon>
                <n-icon><AddOutline /></n-icon>
              </template>
              {{ config.emptyActionText }}
            </n-button>
          </template>
        </n-empty>
      </div>
      <div v-else-if="showSearchEmpty" class="empty-state">
        <n-empty description="没有找到匹配的渠道">
          <template #icon>
            <n-icon aria-hidden="true"><SearchOutline /></n-icon>
          </template>
          <template #extra>
            <n-text depth="3">尝试其他搜索词或清空筛选</n-text>
          </template>
        </n-empty>
      </div>
      <div v-else>
        <draggable
          v-if="!isSearching"
          v-model="state.channels"
          item-key="id"
          class="channels-list"
          ghost-class="ghost"
          chosen-class="chosen"
          drag-class="drag"
          animation="200"
          @end="actions.handleDragEnd"
        >
          <template #item="{ element }">
            <ChannelCard
              :key="element.id"
              :channel="element"
              :collapsed="state.collapsed[element.id]"
              :header-tags="config.getHeaderTags(element, helpers)"
              :info-rows="config.buildInfoRows(element, helpers)"
              :meta="buildMeta(element)"
              :show-apply-button="config.showApplyButton"
              :channel-type="config.type"
              :test-fn="config.testFn"
              :highlight-text="searchQuery"
              @toggle-collapse="actions.toggleCollapse(element.id)"
              @apply="actions.handleApplyToSettings(element)"
              @edit="actions.handleEdit(element)"
              @delete="actions.handleDelete(element.id)"
              @toggle-enabled="value => actions.handleToggleEnabled(element, value)"
              @open-website="url => emit('open-website', url)"
            />
          </template>
        </draggable>
        <div v-else class="channels-list static">
          <ChannelCard
            v-for="element in filteredChannels"
            :key="element.id"
            :channel="element"
            :collapsed="state.collapsed[element.id]"
            :header-tags="config.getHeaderTags(element, helpers)"
            :info-rows="config.buildInfoRows(element, helpers)"
            :meta="buildMeta(element)"
            :show-apply-button="config.showApplyButton"
            :channel-type="config.type"
            :test-fn="config.testFn"
            :highlight-text="searchQuery"
            @toggle-collapse="actions.toggleCollapse(element.id)"
            @apply="actions.handleApplyToSettings(element)"
            @edit="actions.handleEdit(element)"
            @delete="actions.handleDelete(element.id)"
            @toggle-enabled="value => actions.handleToggleEnabled(element, value)"
            @open-website="url => emit('open-website', url)"
          />
        </div>
      </div>
    </div>

    <n-modal
      v-model:show="state.showDialog"
      preset="card"
      :title="state.editingChannel ? config.editTitle : config.addTitle"
      class="channel-dialog"
      :style="{ width: config.modalWidth + 'px', maxHeight: '80vh' }"
      :content-style="{ maxHeight: 'calc(80vh - 100px)', overflowY: 'auto' }"
    >
      <n-form label-placement="left" :label-width="config.formLabelWidth" class="channel-form">
        <template v-for="section in config.formSections" :key="section.title">
          <!-- 条件显示 section -->
          <div
            v-if="!section.showWhen || section.showWhen(state.formData)"
            class="form-section"
            :class="{ collapsible: section.collapsible }"
          >
            <div class="section-title">
              {{ section.title }}
              <span v-if="section.description" class="section-desc">{{ section.description }}</span>
            </div>
            <n-form-item
              v-for="field in section.fields"
              :key="field.key"
              :label="field.label"
              :required="field.required"
              :validation-status="getValidationStatus(field.key)"
              :feedback="getValidationMessage(field.key)"
            >
              <!-- 预设选择器 -->
              <n-select
                v-if="field.type === 'preset'"
                :value="state.formData.presetId"
                :options="presetOptions"
                :placeholder="field.placeholder"
                @update:value="handlePresetChange"
              />
              <!-- 其他字段 -->
              <component
                v-else
                :is="resolveFieldComponent(field)"
                :value="getNestedValue(state.formData, field.key)"
                v-bind="buildFieldProps(field)"
                @update:value="(val) => setNestedValue(state.formData, field.key, val)"
              />
            </n-form-item>
          </div>
        </template>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="actions.closeDialog">取消</n-button>
          <n-button type="primary" @click="actions.handleSave">
            {{ state.editingChannel ? '保存修改' : '添加渠道' }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  NButton,
  NIcon,
  NEmpty,
  NSpin,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSwitch,
  NInputNumber,
  NSelect,
  NText
} from 'naive-ui'
import { useDebounceFn, useStorage } from '@vueuse/core'
import { AddOutline, SearchOutline } from '@vicons/ionicons5'
import draggable from 'vuedraggable'
import ChannelCard from './ChannelCard.vue'
import channelPanelFactories from './channelPanelFactories'
import useChannelManager from '../../composables/useChannelManager'
import { useChannelScheduler } from '../../composables/useChannelScheduler'

const props = defineProps({
  type: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['open-website'])

const configFactory = channelPanelFactories[props.type] || channelPanelFactories.claude
const config = configFactory()
const { state, validation, actions } = useChannelManager(config)
const { getChannelInflight } = useChannelScheduler(config.schedulerSource)

// 跨渠道面板保留搜索词
const searchInput = useStorage('cc-tool-channel-search-input', '')
const searchQuery = useStorage('cc-tool-channel-search-query', '')

const applySearch = useDebounceFn((value) => {
  const normalizedValue = typeof value === 'string' ? value : ''
  const trimmedValue = normalizedValue.trim()

  if (!trimmedValue) {
    searchQuery.value = ''
    return
  }

  // 防止输入清空后 debounce 回写旧关键词
  if (searchInput.value.trim() !== trimmedValue) {
    return
  }

  searchQuery.value = trimmedValue
}, 300)

if (searchInput.value.trim()) {
  applySearch(searchInput.value)
}

function handleSearchInput(value) {
  const normalizedValue = typeof value === 'string' ? value : ''
  searchInput.value = normalizedValue
  if (!normalizedValue.trim()) {
    handleSearchClear()
    return
  }
  applySearch(normalizedValue)
}

function handleSearchClear() {
  searchInput.value = ''
  if (applySearch.cancel) {
    applySearch.cancel()
  }
  searchQuery.value = ''
}

const isSearching = computed(() => searchInput.value.trim() !== '')
const hasSearchQuery = computed(() => searchQuery.value.trim() !== '')

const filteredChannels = computed(() => {
  if (!hasSearchQuery.value) return state.channels
  const query = searchQuery.value.trim().toLowerCase()
  return state.channels.filter((channel) => {
    const fields = [
      channel.name,
      channel.baseUrl,
      channel.baseURL,
      channel.model,
      channel.modelConfig?.model,
      channel.modelConfig?.haikuModel,
      channel.modelConfig?.sonnetModel,
      channel.modelConfig?.opusModel
    ]
    return fields.some((field) => {
      if (field === null || field === undefined) return false
      return String(field).toLowerCase().includes(query)
    })
  })
})

const showSearchEmpty = computed(() => hasSearchQuery.value && filteredChannels.value.length === 0)
const searchResultText = computed(() => {
  if (!hasSearchQuery.value) return ''
  return `已找到 ${filteredChannels.value.length} 个渠道`
})

// 预设选项（仅 Claude 有）
const presetOptions = computed(() => {
  if (!config.presets) return []

  const groups = {}
  config.presets.forEach(preset => {
    const category = preset.category || 'custom'
    if (!groups[category]) {
      groups[category] = {
        type: 'group',
        label: config.presetCategories?.[category] || category,
        key: category,
        children: []
      }
    }
    groups[category].children.push({
      label: preset.name,
      value: preset.id
    })
  })

  return Object.values(groups)
})

// 预设变化处理
function handlePresetChange(presetId) {
  if (config.onPresetChange) {
    const newForm = config.onPresetChange(presetId, state.formData)
    Object.assign(state.formData, newForm)
  } else {
    state.formData.presetId = presetId
  }
}

// 获取嵌套值 (支持 'modelConfig.model' 这种路径)
function getNestedValue(obj, path) {
  if (!path.includes('.')) return obj[path]
  const keys = path.split('.')
  let value = obj
  for (const key of keys) {
    value = value?.[key]
  }
  return value
}

// 设置嵌套值
function setNestedValue(obj, path, value) {
  if (!path.includes('.')) {
    obj[path] = value
    return
  }
  const keys = path.split('.')
  let target = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]]) target[keys[i]] = {}
    target = target[keys[i]]
  }
  target[keys[keys.length - 1]] = value
}

// 获取验证状态（支持嵌套路径）
function getValidationStatus(key) {
  const flatKey = key.replace(/\./g, '_')
  return validation[flatKey]?.status || validation[key]?.status
}

function getValidationMessage(key) {
  const flatKey = key.replace(/\./g, '_')
  return validation[flatKey]?.message || validation[key]?.message
}

const helpers = {
  getChannelInflight,
  formatFreeze: (remaining) => `冻结 ${remaining || 0}s`,
  maskApiKey: (key) => {
    if (!key) return '(未设置)'
    if (key.length <= 12) return '******'
    return `${key.slice(0, 8)}******${key.slice(-4)}`
  },
  handleResetHealth: (channel) => actions.handleResetHealth(channel),
  handleOpenWebsite: (url) => emit('open-website', url)
}

function buildMeta(channel) {
  const inflight = getChannelInflight(channel.id)
  const concurrencyText = channel.maxConcurrency
    ? `${inflight}/${channel.maxConcurrency}`
    : inflight > 0 ? inflight : '不限'
  return {
    weight: channel.weight || 1,
    concurrencyText,
    concurrencyActive: inflight > 0
  }
}

function resolveFieldComponent(field) {
  switch (field.type) {
    case 'password':
    case 'text':
      return NInput
    case 'number':
      return NInputNumber
    case 'switch':
      return NSwitch
    default:
      return NInput
  }
}

function buildFieldProps(field) {
  const base = { placeholder: field.placeholder }
  if (field.type === 'password') {
    base.type = 'password'
    base['show-password-on'] = 'click'
  }
  if (field.type === 'number') {
    base.min = field.min ?? 1
    base.max = field.max ?? 100
    base.step = field.step ?? 1
    base.clearable = field.clearable
    base.style = 'width: 100%;'
  }
  if (field.disabledOnEdit && state.editingChannel) {
    base.disabled = true
  }
  return base
}

defineExpose({
  openAddDialog: actions.openAddDialog,
  refresh: actions.loadChannels,
  toggleAllCollapse: actions.toggleAllCollapse
})
</script>

<style src="./channel-panel-common.css"></style>
