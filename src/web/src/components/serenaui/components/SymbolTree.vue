<template>
  <div class="symbol-tree">
    <div v-for="node in filteredNodes" :key="node.path" class="tree-node">
      <div
        class="node-row"
        :class="{ 'node-row--selected': node.type === 'file' && node.path === selectedPath }"
        @click="handleNodeClick(node)"
      >
        <n-icon class="node-icon" :size="16">
          <component :is="getIcon(node)" />
        </n-icon>
        <span class="node-name">{{ node.name }}</span>
      </div>
      <div v-if="node.type === 'directory' && isExpanded(node)" class="node-children">
        <SymbolTree
          :nodes="node.children || []"
          :selected-path="selectedPath"
          @select="emit('select', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { NIcon } from 'naive-ui'
import { FolderOutline, DocumentTextOutline } from '@vicons/ionicons5'

defineOptions({ name: 'SymbolTree' })

const DEFAULT_IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.cache'])

const props = defineProps({
  nodes: {
    type: Array,
    default: () => []
  },
  selectedPath: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select'])
const expandedMap = reactive({})

const filteredNodes = computed(() => {
  const filterNodes = (items) => (items || [])
    .filter(item => !DEFAULT_IGNORE.has(item.name))
    .map(item => {
      if (item.type === 'directory') {
        return {
          ...item,
          children: filterNodes(item.children || [])
        }
      }
      return item
    })
  return filterNodes(props.nodes)
})

function isExpanded(node) {
  return Boolean(expandedMap[node.path])
}

function toggleExpand(node) {
  expandedMap[node.path] = !expandedMap[node.path]
}

function handleNodeClick(node) {
  if (node.type === 'directory') {
    toggleExpand(node)
  } else {
    emit('select', node)
  }
}

function getIcon(node) {
  return node.type === 'directory' ? FolderOutline : DocumentTextOutline
}
</script>

<style scoped>
.symbol-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tree-node {
  display: flex;
  flex-direction: column;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.node-row:hover {
  background: rgba(124, 58, 237, 0.08);
}

.node-row--selected {
  background: rgba(124, 58, 237, 0.16);
}

.node-icon {
  color: #7c3aed;
}

.node-name {
  font-size: 13px;
}

.node-children {
  padding-left: 16px;
  margin-top: 4px;
}
</style>
