<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    title="检查更新"
    :bordered="false"
    :closable="true"
    style="width: 560px; max-width: 90vw;"
    role="dialog"
    aria-modal="true"
    aria-label="检查更新"
    @close="handleClose"
  >
    <div class="check-body">
      <n-input
        ref="repoInputRef"
        v-model:value="repoInput"
        placeholder="anthropic/skills 或完整 URL"
        :disabled="loading"
      />

      <div v-if="loading" class="loading-row">
        <div class="loading-text">正在检测...</div>
        <n-progress
          type="line"
          :percentage="100"
          :processing="true"
          :indicator-placement="'inside'"
          :height="10"
          :aria-valuenow="100"
          :aria-valuemax="100"
          aria-label="检测中"
        />
      </div>

      <n-alert v-if="errorMessage" type="error" :bordered="false" size="small">
        {{ errorMessage }}
      </n-alert>

      <n-list v-if="!loading && updates.length > 0" class="update-list">
        <n-list-item v-for="item in updates" :key="item.directory">
          <div class="update-item">
            <div class="update-info">
              <div class="update-title">{{ item.name }}</div>
              <div class="update-meta">
                当前 {{ item.currentVersion }} → 最新 {{ item.latestVersion }}
              </div>
            </div>
            <n-button
              size="small"
              type="primary"
              :loading="updatingKey === item.directory"
              :aria-label="`更新 ${item.name} 技能`"
              @click="handleUpdate(item)"
            >
              更新
            </n-button>
          </div>
        </n-list-item>
      </n-list>

      <div v-if="!loading && updates.length === 0 && hasChecked" class="empty-update">
        所有技能已是最新版本
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="handleClose">取消</n-button>
        <n-button type="primary" :loading="loading" @click="handleCheck">
          检测
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { NModal, NInput, NButton, NProgress, NList, NListItem, NAlert } from 'naive-ui'
import { checkUpdate, installSkill, uninstallSkill } from '../api/skills'
import message from '../utils/message'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible', 'updated'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const repoInput = ref('')
const loading = ref(false)
const updates = ref([])
const errorMessage = ref('')
const hasChecked = ref(false)
const updatingKey = ref('')
const repoInputRef = ref(null)

async function handleCheck() {
  if (!repoInput.value.trim()) {
    message.error('请输入仓库地址')
    return
  }

  loading.value = true
  errorMessage.value = ''
  updates.value = []
  hasChecked.value = false

  try {
    const result = await checkUpdate(repoInput.value.trim())
    if (result.success) {
      updates.value = result.data || []
      hasChecked.value = true
    } else {
      errorMessage.value = result.message || '检测失败'
    }
  } catch (err) {
    errorMessage.value = err.response?.data?.message || err.message || '检测失败'
  } finally {
    loading.value = false
  }
}

async function handleUpdate(item) {
  if (!item?.directory) return
  updatingKey.value = item.directory
  try {
    const platforms = Array.isArray(item.installedPlatforms) && item.installedPlatforms.length > 0
      ? item.installedPlatforms
      : ['claude']
    const uninstallResult = await uninstallSkill(item.directory, platforms, true)
    if (!uninstallResult.success) {
      message.error(uninstallResult.error || '更新失败')
      return
    }
    const result = await installSkill(item.directory, {
      owner: item.repoOwner,
      name: item.repoName,
      branch: item.repoBranch || 'main'
    }, platforms)

    if (result.success) {
      message.success(`技能 "${item.name}" 已更新`)
      emit('updated')
      await handleCheck()
    } else {
      message.error(result.error || '更新失败')
    }
  } catch (err) {
    message.error('更新失败: ' + (err.response?.data?.message || err.message))
  } finally {
    updatingKey.value = ''
  }
}

function handleClose() {
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    nextTick(() => {
      if (repoInputRef.value?.focus) {
        repoInputRef.value.focus()
      } else if (repoInputRef.value?.$el?.querySelector) {
        repoInputRef.value.$el.querySelector('input')?.focus()
      }
    })
  } else {
    repoInput.value = ''
    updates.value = []
    errorMessage.value = ''
    hasChecked.value = false
    updatingKey.value = ''
  }
})
</script>

<style scoped>
.check-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.loading-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.loading-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.update-list {
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.update-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.update-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.update-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.update-meta {
  font-size: 12px;
  color: var(--text-secondary);
}

.empty-update {
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 480px) {
  .modal-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .modal-footer :deep(.n-button) {
    width: 100%;
    min-height: 44px;
  }
}
</style>
