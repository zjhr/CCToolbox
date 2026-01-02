<template>
  <div class="symbol-panel">
    <div class="panel-header">
      <div class="panel-title">
        <span>{{ fileLabel }}</span>
      </div>
      <div class="panel-sub">{{ symbolCount }} 个符号</div>
    </div>

    <n-spin :show="loading" class="panel-body">
      <n-empty v-if="symbolCount === 0" description="暂无符号" />
      <div v-else class="symbol-groups">
        <div v-for="group in groupedSymbols" :key="group.name" class="symbol-group">
          <div class="group-title">{{ group.name }} ({{ group.items.length }})</div>
          <div class="group-list">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="symbol-item"
              :class="{ 'symbol-item--active': isActive(item) }"
              @click="handleSelect(item)"
            >
              <div class="symbol-main">
                <span class="symbol-name">{{ item.name }}</span>
                <span v-if="item.count > 1" class="symbol-count">×{{ item.count }}</span>
                <span v-if="item.detail" class="symbol-detail">{{ item.detail }}</span>
              </div>
              <n-button size="tiny" quaternary @click.stop="handleSelect(item)">引用</n-button>
            </div>
          </div>
        </div>
      </div>
    </n-spin>

  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NButton, NEmpty, NSpin } from 'naive-ui'

const props = defineProps({
  filePath: {
    type: String,
    default: ''
  },
  symbols: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['search-references'])

const activeSymbolKey = ref('')

const fileLabel = computed(() => props.filePath || '请选择文件')

const kindMap = {
  1: '文件',
  2: '模块',
  3: '命名空间',
  4: '包',
  5: '类',
  6: '方法',
  7: '属性',
  8: '字段',
  9: '构造函数',
  10: '枚举',
  11: '接口',
  12: '函数',
  13: '变量',
  14: '常量',
  15: '字符串',
  16: '数字',
  17: '布尔',
  18: '数组',
  19: '对象',
  20: '键',
  21: '空值',
  22: '枚举成员',
  23: '结构体',
  24: '事件',
  25: '运算符',
  26: '类型参数'
}

function makeSymbolKey(item) {
  return `${item.name}|${item.kind}|${item.detail}`
}

const flattenedSymbols = computed(() => {
  const result = []
  const seen = new Map()
  const walk = (items) => {
    items.forEach((item) => {
      if (!item) return
      const normalized = {
        name: item.name || '未知符号',
        kind: item.kind || 0,
        detail: item.detail || '',
        range: item.range || null,
        selectionRange: item.selectionRange || null
      }
      const key = makeSymbolKey(normalized)
      if (seen.has(key)) {
        const index = seen.get(key)
        if (typeof index === 'number' && result[index]) {
          result[index].count += 1
        }
        if (Array.isArray(item.children) && item.children.length) {
          walk(item.children)
        }
        return
      }
      seen.set(key, result.length)
      result.push({
        id: key,
        ...normalized,
        count: 1
      })
      if (Array.isArray(item.children) && item.children.length) {
        walk(item.children)
      }
    })
  }
  walk(props.symbols || [])
  return result
})

const groupedSymbols = computed(() => {
  const groups = {}
  flattenedSymbols.value.forEach((item) => {
    const groupName = kindMap[item.kind] || '其他'
    if (!groups[groupName]) {
      groups[groupName] = []
    }
    groups[groupName].push(item)
  })
  return Object.keys(groups).sort().map(name => ({
    name,
    items: groups[name].slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }))
})

const symbolCount = computed(() => flattenedSymbols.value.length)

function handleSelect(item) {
  if (!item) return
  activeSymbolKey.value = makeSymbolKey(item)
  emit('search-references', item)
}

function isActive(item) {
  return activeSymbolKey.value === makeSymbolKey(item)
}

watch(
  () => props.filePath,
  () => {
    activeSymbolKey.value = ''
  }
)
</script>

<style scoped>
.symbol-panel {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.panel-title {
  font-weight: 600;
  color: #111827;
  font-size: 13px;
}

.panel-sub {
  font-size: 12px;
  color: #6b7280;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-body :deep(.n-spin-container) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.panel-body :deep(.n-spin-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding-bottom: 8px;
  box-sizing: border-box;
}

.symbol-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-title {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.symbol-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(124, 58, 237, 0.06);
  cursor: pointer;
  transition: background 0.2s ease;
}

.symbol-item:hover {
  background: rgba(124, 58, 237, 0.12);
}

.symbol-item--active {
  background: rgba(124, 58, 237, 0.2);
}

.symbol-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.symbol-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.symbol-count {
  font-size: 12px;
  color: #6b7280;
  margin-left: 6px;
}

.symbol-detail {
  font-size: 12px;
  color: #6b7280;
}

</style>
