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
  </div>
</template>

<script setup>
import { NButton, NSpace } from 'naive-ui'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  counts: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue'])

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
</script>

<style scoped>
.filter-bar {
  position: sticky;
  top: 0;
  z-index: 8;
  padding: 6px 16px;
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-color);
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
  height: 30px;
  font-size: 12px;
  color: var(--n-text-color-3);
  border: 1px solid var(--n-border-color);
  background: var(--n-color-embedded);
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
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
  letter-spacing: 0.01em;
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
  font-variant-numeric: tabular-nums;
}

.filter-btn.active .filter-count {
  color: #b45309;
  background: rgba(245, 158, 11, 0.2);
}

@media (max-width: 640px) {
  .filter-bar {
    padding: 8px 10px;
  }

  .filter-btn {
    height: 32px;
    padding: 0 12px;
  }

  .filter-count {
    height: 18px;
    line-height: 18px;
  }
}
</style>
