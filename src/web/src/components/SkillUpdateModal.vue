<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    title="设置更新源"
    :bordered="false"
    :closable="true"
    style="width: 420px; max-width: 90vw;"
    role="dialog"
    aria-modal="true"
    aria-label="设置更新源"
    @close="handleClose"
  >
    <div class="modal-body">
      <div class="hint">
        填写 GitHub 地址（owner/name 或完整 URL），可选分支：owner/name#branch
      </div>
      <n-input
        v-model:value="repoInput"
        placeholder="例如：owner/repo#main"
        :disabled="saving"
        clearable
        class="repo-input"
      />
      <n-alert
        type="info"
        :bordered="false"
        size="small"
        class="info-alert"
      >
        留空保存将清除该技能的更新源配置
      </n-alert>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="handleClose" :disabled="saving">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">保存</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NModal, NButton, NInput, NAlert } from 'naive-ui'
import { saveSkillUpdateSource } from '../api/skills'
import message from '../utils/message'

const props = defineProps({
  visible: Boolean,
  skill: Object
})

const emit = defineEmits(['update:visible', 'saved'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const repoInput = ref('')
const saving = ref(false)

function formatRepoInput(skill) {
  if (!skill) return ''
  const update = skill.update
  if (update?.repoOwner && update?.repoName) {
    const suffix = update.repoBranch ? `#${update.repoBranch}` : ''
    return `${update.repoOwner}/${update.repoName}${suffix}`
  }
  if (skill.repoOwner && skill.repoName) {
    const suffix = skill.repoBranch ? `#${skill.repoBranch}` : ''
    return `${skill.repoOwner}/${skill.repoName}${suffix}`
  }
  return ''
}

async function handleSave() {
  if (!props.skill?.directory) {
    message.error('缺少技能目录')
    return
  }
  saving.value = true
  try {
    const value = repoInput.value.trim()
    const result = await saveSkillUpdateSource(props.skill.directory, value)
    if (result.success) {
      message.success(value ? '更新源已保存' : '更新源已清除')
      emit('saved')
      emit('update:visible', false)
    } else {
      message.error(result.error || result.message || '保存失败')
    }
  } catch (err) {
    message.error('保存失败: ' + (err.response?.data?.message || err.message))
  } finally {
    saving.value = false
  }
}

function handleClose() {
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    repoInput.value = formatRepoInput(props.skill)
  } else {
    repoInput.value = ''
  }
})
</script>

<style scoped>
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.repo-input {
  width: 100%;
}

.info-alert {
  margin-top: 4px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 480px) {
  .modal-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
