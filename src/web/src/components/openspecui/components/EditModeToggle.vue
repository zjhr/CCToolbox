<template>
  <div class="edit-mode-toggle">
    <template v-if="editMode">
      <n-button size="small" @click="handleCancel">取消</n-button>
      <n-button size="small" type="primary" @click="handleSave">保存</n-button>
    </template>
    <template v-else>
      <n-button size="small" :disabled="disabled" @click="startEdit">
        <template #icon>
          <n-icon :component="EditIcon" />
        </template>
        编辑
      </n-button>
    </template>

    <n-modal v-model:show="showConfirm" preset="dialog" title="放弃未保存更改？">
      <div class="confirm-content">当前编辑内容尚未保存，确认放弃吗？</div>
      <template #action>
        <n-button size="small" @click="showConfirm = false">继续编辑</n-button>
        <n-button size="small" type="warning" @click="confirmDiscard">放弃更改</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { NButton, NIcon, NModal } from 'naive-ui'
import { Create as EditIcon } from '@vicons/ionicons5'

const props = defineProps({
  editMode: {
    type: Boolean,
    default: false
  },
  hasUnsavedChanges: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:editMode', 'save', 'cancel'])
const showConfirm = ref(false)

function startEdit() {
  emit('update:editMode', true)
}

function handleSave() {
  emit('save')
}

function handleCancel() {
  if (props.hasUnsavedChanges) {
    showConfirm.value = true
    return
  }
  emit('cancel')
  emit('update:editMode', false)
}

function confirmDiscard() {
  showConfirm.value = false
  emit('cancel')
  emit('update:editMode', false)
}
</script>

<style scoped>
.edit-mode-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.confirm-content {
  margin: 8px 0 12px;
  color: #475569;
}
</style>
