<template>
  <div class="reference-panel">
    <div class="panel-header">
      <div class="panel-title">引用结果</div>
      <n-button size="tiny" quaternary @click="emit('close')">关闭</n-button>
    </div>
    <div class="panel-sub" v-if="symbol">{{ symbol }}</div>

    <n-spin :show="loading" class="panel-body">
      <n-empty v-if="items.length === 0" description="暂无引用" />
      <n-list v-else>
        <n-list-item v-for="ref in items" :key="makeKey(ref)">
          <div class="reference-item">
            <div class="reference-header" @click="toggleItem(makeKey(ref))">
              <div class="reference-path">{{ ref.file }}:{{ ref.line }}</div>
              <n-button size="tiny" quaternary @click.stop="toggleItem(makeKey(ref))">
                {{ isOpen(makeKey(ref)) ? '收起' : '展开' }}
              </n-button>
            </div>
            <div v-show="isOpen(makeKey(ref))" class="reference-preview">{{ ref.preview }}</div>
          </div>
        </n-list-item>
      </n-list>
    </n-spin>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { NButton, NEmpty, NSpin, NList, NListItem } from 'naive-ui'

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  symbol: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close'])

const openKeys = ref([])

function makeKey(ref) {
  return `${ref.file}:${ref.line}:${ref.column}`
}

function isOpen(key) {
  return openKeys.value.includes(key)
}

function toggleItem(key) {
  if (isOpen(key)) {
    openKeys.value = openKeys.value.filter(item => item !== key)
  } else {
    openKeys.value = [...openKeys.value, key]
  }
}

watch(
  () => props.items,
  () => {
    openKeys.value = []
  }
)
</script>

<style scoped>
.reference-panel {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}

.panel-sub {
  font-size: 12px;
  color: #6b7280;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.panel-body :deep(.n-spin-container) {
  height: 100%;
}

.reference-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reference-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}

.reference-path {
  font-size: 12px;
  color: #374151;
}

.reference-preview {
  font-size: 12px;
  color: #6b7280;
}
</style>
