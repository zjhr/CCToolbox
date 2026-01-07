<template>
  <div class="filter-bar">
    <n-space size="small" wrap>
      <n-button
        v-for="option in options"
        :key="option.value"
        size="small"
        :class="['filter-btn', { active: isActive(option.value) }]"
        :tertiary="true"
        :bordered="false"
        :aria-pressed="isActive(option.value)"
        @click="toggleFilter(option.value)"
      >
        <span class="filter-label">{{ option.label }}</span>
        <span class="filter-count">{{ counts[option.value] || 0 }}</span>
      </n-button>
    </n-space>
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
  { label: '思考', value: 'thinking' }
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
  padding: 8px 20px;
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-color);
}

.filter-btn {
  border-radius: 999px;
  padding: 2px 10px;
  height: 24px;
  font-size: 12px;
  color: var(--n-text-color-2);
  border: 1px solid var(--n-border-color);
  background: transparent;
  transition: all 0.18s ease;
}

.filter-btn:hover {
  color: var(--n-text-color-1);
  border-color: rgba(245, 158, 11, 0.4);
}

.filter-btn.active {
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.6);
  background: rgba(245, 158, 11, 0.08);
}

.filter-label {
  margin-right: 6px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.filter-count {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  border: 1px solid var(--n-border-color);
  color: var(--n-text-color-3);
  background: var(--n-color-embedded);
}

.filter-btn.active .filter-count {
  border-color: rgba(245, 158, 11, 0.5);
  color: #b45309;
  background: rgba(245, 158, 11, 0.18);
}
</style>
