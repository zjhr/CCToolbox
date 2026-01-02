<template>
  <div class="browser-tab">
    <div class="browser-header">
      <n-input v-model:value="searchQuery" placeholder="搜索符号..." clearable size="small">
        <template #prefix>
          <n-icon><SearchOutline /></n-icon>
        </template>
      </n-input>
    </div>

    <div class="browser-body">
      <div class="browser-left">
        <n-spin :show="store.loading.files">
          <SymbolTree
            :nodes="store.files"
            :selected-path="store.selectedFile"
            @select="handleSelectFile"
          />
        </n-spin>
      </div>
      <div class="browser-main">
        <FileSymbolPanel
          :file-path="store.selectedFile"
          :symbols="store.symbols"
          :loading="store.loading.symbols"
          @search-references="handleReferences"
        />
      </div>
      <div v-if="showReferences" class="browser-ref">
        <ReferencePanel
          :items="store.references"
          :loading="store.loading.references"
          :symbol="referenceSymbol"
          @close="closeReferences"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { NInput, NIcon, NSpin } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { useSerenaStore } from '../../../stores/serena'
import message from '../../../utils/message'
import SymbolTree from '../components/SymbolTree.vue'
import FileSymbolPanel from '../components/FileSymbolPanel.vue'
import ReferencePanel from '../components/ReferencePanel.vue'

const store = useSerenaStore()
const searchQuery = ref('')
const showReferences = ref(false)
const referenceSymbol = ref('')
let debounceTimer = null

watch(
  () => searchQuery.value,
  (value) => {
    store.setSymbolQuery(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (!store.selectedFile && !value) return
      store.fetchSymbols({
        filePath: store.selectedFile,
        query: value
      }).catch((err) => {
        message.error(err.message || '加载符号失败')
      })
    }, 300)
  }
)

async function handleSelectFile(node) {
  store.selectedFile = node.path
  store.references = []
  showReferences.value = false
  referenceSymbol.value = ''
  try {
    await store.fetchSymbols({ filePath: node.path, query: searchQuery.value })
  } catch (err) {
    message.error(err.message || '加载符号失败')
  }
}

async function handleReferences(symbol) {
  if (!symbol?.name) return
  referenceSymbol.value = symbol.name
  showReferences.value = true
  try {
    await store.fetchReferences(symbol.name)
  } catch (err) {
    message.error(err.message || '查询引用失败')
  }
}

function closeReferences() {
  showReferences.value = false
}
</script>

<style scoped>
.browser-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.browser-header {
  display: flex;
  justify-content: flex-end;
}

.browser-body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.browser-left {
  flex: 0 0 280px;
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  padding: 8px;
  background: var(--bg-primary);
  overflow: auto;
  min-height: 0;
}

.browser-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.browser-ref {
  flex: 0 0 320px;
  min-width: 240px;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

@media (max-width: 900px) {
  .browser-body {
    flex-direction: column;
  }

  .browser-left {
    flex: none;
    width: 100%;
  }

  .browser-ref {
    width: 100%;
    flex: none;
  }
}
</style>
