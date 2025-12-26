<template>
  <div class="conflict-resolver">
    <div class="conflict-header">
      <span class="conflict-title">检测到冲突</span>
      <span class="conflict-path">{{ store.conflict?.path }}</span>
    </div>

    <DiffViewer :diff="diffText" />

    <div class="conflict-actions">
      <n-button type="warning" @click="keepLocal">保留本地</n-button>
      <n-button type="default" @click="keepRemote">使用远程</n-button>
      <n-button type="primary" @click="openMerge">手动合并</n-button>
    </div>

    <n-modal v-model:show="showMerge" preset="dialog" title="手动合并">
      <n-input
        v-model:value="mergeContent"
        type="textarea"
        :autosize="{ minRows: 6, maxRows: 16 }"
      />
      <template #action>
        <n-space>
          <n-button @click="showMerge = false">取消</n-button>
          <n-button type="primary" @click="confirmMerge">应用合并</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NButton, NModal, NInput, NSpace } from 'naive-ui'
import { createTwoFilesPatch } from 'diff'
import { useOpenSpecStore } from '../../../stores/openspec'
import { useOpenSpecConflict } from '../../../composables/useOpenSpecConflict'
import DiffViewer from './DiffViewer.vue'

const store = useOpenSpecStore()
const { keepLocal, keepRemote, manualMerge } = useOpenSpecConflict()

const showMerge = ref(false)
const mergeContent = ref('')

watch(
  () => store.conflict,
  (conflict) => {
    if (conflict) {
      mergeContent.value = conflict.local || conflict.current || ''
    }
  },
  { immediate: true }
)

const diffText = computed(() => {
  if (!store.conflict) return ''
  return createTwoFilesPatch(
    '本地',
    '远程',
    store.conflict.local || '',
    store.conflict.current || '',
    '',
    ''
  )
})

function openMerge() {
  showMerge.value = true
}

async function confirmMerge() {
  await manualMerge(mergeContent.value)
  showMerge.value = false
}
</script>

<style scoped>
.conflict-resolver {
  border: 1px solid #f59e0b;
  background: #fff7ed;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.conflict-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
}

.conflict-title {
  font-weight: 600;
  color: #b45309;
}

.conflict-path {
  color: #92400e;
}

.conflict-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
