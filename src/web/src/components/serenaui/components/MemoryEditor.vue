<template>
  <div class="memory-editor">
    <div class="editor-header">
      <div class="editor-title">
        <span>{{ titleText }}</span>
        <n-tag v-if="dirty" size="small" type="warning" :bordered="false">未保存</n-tag>
      </div>
      <div class="editor-actions">
        <n-button v-if="!editMode" size="small" type="primary" @click="startEdit" :disabled="!name">编辑</n-button>
        <template v-else>
          <n-button size="small" @click="cancelEdit">取消</n-button>
          <n-button size="small" type="primary" :loading="saving" @click="save">保存</n-button>
        </template>
        <n-button size="small" type="error" quaternary class="delete-button" :disabled="!name" @click="showDelete = true">删除</n-button>
      </div>
    </div>

    <n-spin :show="loading" class="editor-body">
      <div v-if="!name" class="empty">请选择左侧记忆</div>
      <div v-else class="editor-content">
        <MdPreview v-if="!editMode" :model-value="content" />
        <MdEditor v-else v-model="draft" :preview="false" />
      </div>
    </n-spin>

    <n-modal v-model:show="showDelete" preset="dialog" title="确认删除？">
      <div class="confirm-text">确认删除记忆 {{ name }} 吗？</div>
      <template #action>
        <n-button size="small" @click="showDelete = false">取消</n-button>
        <n-button size="small" type="error" @click="confirmDelete">删除</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NButton, NTag, NSpin, NModal } from 'naive-ui'
import { MdEditor, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const props = defineProps({
  name: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['save', 'delete'])

const editMode = ref(false)
const draft = ref('')
const dirty = ref(false)
const saving = ref(false)
const showDelete = ref(false)

const titleText = computed(() => props.name || '记忆详情')

watch(
  () => props.content,
  (value) => {
    if (!editMode.value) {
      draft.value = value
      dirty.value = false
    }
  },
  { immediate: true }
)

watch(
  () => props.name,
  () => {
    editMode.value = false
    dirty.value = false
    draft.value = props.content
  }
)

watch(draft, (value) => {
  if (!editMode.value) return
  dirty.value = value !== props.content
})

function startEdit() {
  if (!props.name) return
  editMode.value = true
  draft.value = props.content
  dirty.value = false
}

function cancelEdit() {
  editMode.value = false
  draft.value = props.content
  dirty.value = false
}

async function save() {
  if (!props.name) return
  saving.value = true
  try {
    emit('save', { name: props.name, content: draft.value })
    editMode.value = false
    dirty.value = false
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  showDelete.value = false
  if (!props.name) return
  emit('delete', props.name)
}
</script>

<style scoped>
.memory-editor {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 12px;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  flex: 1;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.editor-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.delete-button {
  margin-right: 8px;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
}

.editor-body :deep(.n-spin-container) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  flex: 1;
}

.editor-body :deep(.n-spin-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding-bottom: 8px;
  box-sizing: border-box;
}

.editor-content :deep(.md-editor) {
  height: 100%;
  min-height: 0;
}

.editor-content {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
}

.editor-content :deep(.md-preview) {
  padding-bottom: 12px;
}

.empty {
  padding: 24px;
  color: #6b7280;
  text-align: center;
  margin: auto;
  width: 100%;
}

.confirm-text {
  font-size: 13px;
  color: #374151;
}
</style>
