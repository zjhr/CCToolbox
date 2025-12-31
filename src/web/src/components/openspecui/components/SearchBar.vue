<template>
  <div class="search-bar">
    <n-input
      :value="modelValue"
      :placeholder="placeholder"
      :loading="loading"
      :clearable="clearable"
      clear-button-class="search-clear-btn"
      @update:value="handleInput"
      @clear="handleClear"
    >
      <template #prefix>
        <n-icon :component="SearchIcon" />
      </template>
    </n-input>
    <div v-if="loading" class="search-feedback">搜索中...</div>
  </div>
</template>

<script setup>
import { useDebounceFn } from '@vueuse/core'
import { NIcon, NInput } from 'naive-ui'
import { Search as SearchIcon } from '@vicons/ionicons5'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '搜索...'
  },
  loading: {
    type: Boolean,
    default: false
  },
  clearable: {
    type: Boolean,
    default: true
  },
  debounce: {
    type: Number,
    default: 300
  }
})

const emit = defineEmits(['update:modelValue', 'search', 'clear'])

const emitSearch = useDebounceFn((value) => {
  emit('search', value)
}, props.debounce)

function handleInput(value) {
  emit('update:modelValue', value)
  emitSearch(value)
}

function handleClear() {
  emit('update:modelValue', '')
  emit('clear')
  emitSearch('')
}
</script>

<style scoped>
.search-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  margin-bottom: 12px;
  padding: 8px 0;
  background: var(--bg-primary);
}

.search-feedback {
  position: absolute;
  right: 32px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: #999;
}
</style>
