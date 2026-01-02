<template>
  <div class="memories-tab">
    <div class="memories-left">
      <div class="memories-toolbar">
        <n-input v-model:value="searchQuery" placeholder="搜索记忆..." clearable size="small">
          <template #prefix>
            <n-icon><SearchOutline /></n-icon>
          </template>
        </n-input>
        <n-button
          size="small"
          type="error"
          :disabled="selectedNames.length === 0"
          @click="handleBatchDelete"
        >
          批量删除 ({{ selectedNames.length }})
        </n-button>
      </div>

      <n-spin :show="store.loading.memories" class="memories-list">
        <div class="memories-scroll">
          <n-empty v-if="filteredMemories.length === 0" description="暂无记忆" />
          <n-list v-else>
            <n-list-item
              v-for="item in filteredMemories"
              :key="item.name"
              class="memory-item"
              :class="{ 'memory-item--active': item.name === store.selectedMemory }"
              @click="openMemory(item.name)"
            >
              <template #prefix>
                <n-checkbox
                  :checked="selectedNames.includes(item.name)"
                  @click.stop
                  @update:checked="(val) => toggleSelect(item.name, val)"
                />
              </template>
              <div class="memory-info">
                <div class="memory-name">{{ item.name }}</div>
                <div class="memory-meta">{{ formatTime(item.mtime) }} · {{ formatSize(item.size) }}</div>
              </div>
            </n-list-item>
          </n-list>
        </div>
      </n-spin>
    </div>

    <div class="memories-right">
      <MemoryEditor
        :name="store.selectedMemory"
        :content="store.memoryContent"
        :loading="store.loading.memoryDetail"
        @save="handleSave"
        @delete="handleDelete"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NInput, NIcon, NButton, NList, NListItem, NCheckbox, NSpin, NEmpty } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { useSerenaStore } from '../../../stores/serena'
import message from '../../../utils/message'
import MemoryEditor from '../components/MemoryEditor.vue'

const store = useSerenaStore()
const searchQuery = ref('')
const selectedNames = ref([])

const filteredMemories = computed(() => store.memories)
let debounceTimer = null

watch(
  () => searchQuery.value,
  (value) => {
    store.setMemoryQuery(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      store.fetchMemories().catch((err) => {
        message.error(err.message || '搜索记忆失败')
      })
    }, 300)
  }
)

function formatTime(ts) {
  if (!ts) return '未知时间'
  return new Date(ts).toLocaleString()
}

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function toggleSelect(name, checked) {
  if (checked) {
    selectedNames.value = Array.from(new Set([...selectedNames.value, name]))
  } else {
    selectedNames.value = selectedNames.value.filter(item => item !== name)
  }
}

async function openMemory(name) {
  try {
    await store.openMemory(name)
  } catch (err) {
    message.error(err.message || '读取记忆失败')
  }
}

async function handleSave(payload) {
  if (!payload?.name) return
  try {
    await store.saveMemory(payload.name, payload.content)
    message.success('记忆已保存')
  } catch (err) {
    message.error(err.message || '保存失败')
  }
}

async function handleDelete(name) {
  if (!name) return
  try {
    await store.removeMemory(name)
    selectedNames.value = selectedNames.value.filter(item => item !== name)
    message.success('记忆已删除')
  } catch (err) {
    message.error(err.message || '删除失败')
  }
}

async function handleBatchDelete() {
  if (selectedNames.value.length === 0) return
  try {
    await store.removeMemories(selectedNames.value)
    selectedNames.value = []
    message.success('批量删除完成')
  } catch (err) {
    message.error(err.message || '批量删除失败')
  }
}
</script>

<style scoped>
.memories-tab {
  display: flex;
  gap: 12px;
  height: 100%;
  flex: 1;
  min-height: 0;
}

.memories-left {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.memories-right {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  height: 100%;
  overflow: hidden;
}

.memories-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-primary);
  flex-shrink: 0;
  padding-bottom: 8px;
}

.memories-list {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.memories-list :deep(.n-spin-container) {
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.memories-list :deep(.n-spin-content) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.memories-scroll {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
  width: 100%;
  padding-bottom: 8px;
  box-sizing: border-box;
}

.memory-item {
  cursor: pointer;
  padding: 8px 6px;
  border-radius: 6px;
}

.memory-item:hover {
  background: rgba(99, 102, 241, 0.08);
}

.memory-item--active {
  background: rgba(124, 58, 237, 0.12);
}

.memory-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.memory-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.memory-meta {
  font-size: 12px;
  color: #6b7280;
}

@media (max-width: 900px) {
  .memories-tab {
    flex-direction: column;
  }

  .memories-left {
    flex: none;
    width: 100%;
  }
}
</style>
