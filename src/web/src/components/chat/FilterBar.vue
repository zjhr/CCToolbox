<template>
  <div class="filter-bar">
    <div class="filter-scroll">
      <n-space size="small" :wrap="false" class="filter-row">
        <n-button
          v-for="option in options"
          :key="option.value"
          size="small"
          :class="['filter-btn', { active: isActive(option.value) }]"
          :quaternary="true"
          :bordered="false"
          :aria-pressed="isActive(option.value)"
          @click="toggleFilter(option.value)"
        >
          <span class="filter-label">{{ option.label }}</span>
          <span class="filter-count">{{ counts[option.value] || 0 }}</span>
        </n-button>
      </n-space>
    </div>

    <!-- Search Section -->
    <div class="search-section">
      <div class="search-input-wrapper">
        <n-input
          :value="searchKeyword"
          size="small"
          placeholder="搜索对话内容关键字..."
          clearable
          class="search-input"
          @update:value="onKeywordUpdate"
          @keydown.enter="emit('search')"
          @clear="emit('clear')"
        >
          <template #prefix>
            <n-icon :component="SearchIcon" />
          </template>
        </n-input>
      </div>
      
      <div v-if="searchMatchesCount > 0" class="search-controls">
        <span class="search-counter">
          {{ searchMatchesCount > 0 ? searchCurrentIndex + 1 : 0 }}/{{ searchMatchesCount }}
        </span>
        <n-button-group size="small">
          <n-button quaternary circle size="small" @click="emit('prev')">
            <template #icon><n-icon :component="ChevronUpIcon" /></template>
          </n-button>
          <n-button quaternary circle size="small" @click="emit('next')">
            <template #icon><n-icon :component="ChevronDownIcon" /></template>
          </n-button>
        </n-button-group>
      </div>
    </div>
  </div>
</template>

<script setup>
import { NButton, NSpace, NInput, NIcon, NButtonGroup } from 'naive-ui'
import { Search as SearchIcon, ChevronUp as ChevronUpIcon, ChevronDown as ChevronDownIcon } from '@vicons/ionicons5'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  counts: {
    type: Object,
    default: () => ({})
  },
  searchKeyword: {
    type: String,
    default: ''
  },
  searchMatchesCount: {
    type: Number,
    default: 0
  },
  searchCurrentIndex: {
    type: Number,
    default: 0
  },
  loadingSearch: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue',
  'update:searchKeyword',
  'search',
  'next',
  'prev',
  'clear'
])

const options = [
  { label: '用户', value: 'user' },
  { label: '助手', value: 'assistant' },
  { label: '工具', value: 'tool' },
  { label: '思考', value: 'thinking' },
  { label: '子代理', value: 'subagent' }
]

function isActive(value) {
  return props.modelValue.includes(value)
}

function toggleFilter(value) {
  const next = new Set(props.modelValue)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  emit('update:modelValue', Array.from(next))
}

function onKeywordUpdate(val) {
  emit('update:searchKeyword', val)
}
</script>

<style scoped>
.filter-bar {
  position: sticky;
  top: 0;
  z-index: 8;
  padding: 8px 16px;
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-scroll {
  overflow-x: auto;
  scrollbar-width: none;
}

.filter-scroll::-webkit-scrollbar {
  display: none;
}

.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
}

.filter-btn {
  border-radius: 6px;
  padding: 0 10px;
  height: 28px;
  font-size: 12px;
  color: var(--n-text-color-3);
  border: 1px solid var(--n-border-color);
  background: var(--n-color-embedded);
  transition: all 0.2s ease;
}

.filter-btn:hover {
  color: var(--n-text-color-2);
  background: var(--n-hover-color);
}

.filter-btn.active {
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
}

.filter-label {
  margin-right: 6px;
  font-size: 12px;
  font-weight: 500;
}

.filter-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  color: var(--n-text-color-3);
  background: var(--n-color);
}

.filter-btn.active .filter-count {
  color: #b45309;
  background: rgba(245, 158, 11, 0.2);
}

/* Search Section Styles */
.search-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
}

.search-input-wrapper {
  flex: 1;
}

.search-input {
  --n-border-radius: 8px;
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.search-counter {
  font-size: 12px;
  color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: right;
}

@media (max-width: 640px) {
  .filter-bar {
    padding: 8px 12px;
  }
}
</style>
