<template>
  <div class="file-tree">
    <div v-for="node in nodes" :key="node.path" class="tree-node">
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
        <FileTree
          :nodes="node.children || []"
          :selected-path="selectedPath"
          @select="emit('select', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { NIcon } from 'naive-ui'
import { FolderOutline, DocumentTextOutline } from '@vicons/ionicons5'

defineOptions({ name: 'FileTree' })

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
.file-tree {
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
  background: rgba(24, 160, 88, 0.08);
}

.node-row--selected {
  background: #fff4e6;
  border: 1px solid #f0d9bb;
}

.node-row--selected .node-name {
  color: #7a4a1f;
  font-weight: 600;
}

.node-icon {
  color: #18a058;
}

.node-name {
  font-size: 13px;
}

.node-children {
  padding-left: 16px;
  margin-top: 4px;
}
</style>
