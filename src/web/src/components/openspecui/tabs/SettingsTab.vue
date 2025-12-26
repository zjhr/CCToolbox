<template>
  <div class="settings-tab">
    <n-form label-width="90" label-placement="left">
      <n-form-item label="项目目录">
        <n-input :value="store.projectPath" disabled />
      </n-form-item>
      <n-form-item label="CLI 配置">
        <n-input :value="form.cliConfigPath" disabled />
      </n-form-item>
      <n-form-item label="CLI 版本">
        <n-spin :show="settingsLoading" size="small">
          <div v-if="settingsLoading" class="cli-loading">
            <n-text depth="3">加载中...</n-text>
          </div>
          <div v-else class="cli-info">
            <n-tag size="small" :bordered="false" type="info">
              已安装 {{ cliInfo.installedVersion || '未检测' }}
            </n-tag>
            <n-tag size="small" :bordered="false" type="success">
              最新 {{ cliInfo.latestVersion || '未知' }}
            </n-tag>
          </div>
        </n-spin>
      </n-form-item>
      <n-form-item label="定时刷新">
        <n-switch v-model:value="form.autoRefresh" />
      </n-form-item>
      <n-form-item label="刷新间隔">
        <n-input v-model:value="form.refreshInterval" placeholder="毫秒" />
      </n-form-item>
    </n-form>

    <div class="tools-section">
      <div class="section-title">AI 工具</div>
      <n-spin :show="settingsLoading" size="small">
        <div v-if="settingsLoading" class="tools-empty">
          <n-text depth="3">加载中...</n-text>
        </div>
        <div v-else-if="store.data.tools.length === 0" class="tools-empty">
          <n-text depth="3">暂无工具数据</n-text>
        </div>
        <div v-else class="tools-grid">
          <n-checkbox
            v-for="tool in store.data.tools"
            :key="tool.id"
            :checked="isToolChecked(tool)"
            :disabled="tool.installed"
            @update:checked="(checked) => handleToolToggle(tool, checked)"
          >
            {{ tool.name }}
          </n-checkbox>
        </div>
      </n-spin>
      <div class="tools-actions">
        <n-button
          v-if="selectedCount > 0"
          type="primary"
          size="small"
          @click="openInitModal"
        >
          添加{{ selectedCount }}个新工具
        </n-button>
      </div>
    </div>

    <div class="actions">
      <n-button type="primary" @click="handleSave" :loading="saving">保存设置</n-button>
    </div>

    <n-modal v-model:show="showInitModal" preset="dialog" title="初始化 OpenSpec 工具">
      <div class="modal-content">
        <n-text depth="3">将运行命令：</n-text>
        <n-input :value="initCommand" readonly />
      </div>
      <template #action>
        <n-button quaternary @click="showInitModal = false">取消</n-button>
        <n-button type="primary" :loading="runningInit" @click="runInit">运行</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { NForm, NFormItem, NInput, NSwitch, NButton, NTag, NCheckbox, NText, NModal, NSpin } from 'naive-ui'
import { useOpenSpecStore } from '../../../stores/openspec'
import { initTools as initToolsApi } from '../../../api/openspec'
import message from '../../../utils/message'

const store = useOpenSpecStore()
const saving = ref(false)

const form = ref({
  autoRefresh: true,
  refreshInterval: 15000,
  cliConfigPath: ''
})

const cliInfo = computed(() => store.data.cli || {})
const settingsLoading = computed(() => store.tabLoading.settings)
const selectedTools = ref([])
const showInitModal = ref(false)
const runningInit = ref(false)

const selectedCount = computed(() => selectedTools.value.length)
const initCommand = computed(() => {
  if (selectedTools.value.length === 0) return 'openspec init --tools '
  return `openspec init --tools ${selectedTools.value.join(',')}`
})

watch(
  () => store.data.settings,
  (val) => {
    if (!val) return
    form.value = {
      autoRefresh: val.autoRefresh !== false,
      refreshInterval: val.refreshInterval || 15000,
      cliConfigPath: val.cliConfigPath || ''
    }
  },
  { immediate: true }
)

watch(
  () => store.data.tools,
  (tools) => {
    const installed = new Set((tools || []).filter(item => item.installed).map(item => item.id))
    selectedTools.value = selectedTools.value.filter(id => !installed.has(id))
  },
  { immediate: true }
)

async function handleSave() {
  saving.value = true
  try {
    await store.saveSettings({
      autoRefresh: form.value.autoRefresh,
      refreshInterval: Number(form.value.refreshInterval) || 15000
    })
    message.success('设置已保存')
  } finally {
    saving.value = false
  }
}

function isToolChecked(tool) {
  if (!tool) return false
  return tool.installed || selectedTools.value.includes(tool.id)
}

function handleToolToggle(tool, checked) {
  if (!tool || tool.installed) return
  if (checked) {
    if (!selectedTools.value.includes(tool.id)) {
      selectedTools.value = [...selectedTools.value, tool.id]
    }
  } else {
    selectedTools.value = selectedTools.value.filter(id => id !== tool.id)
  }
}

function openInitModal() {
  showInitModal.value = true
}

async function runInit() {
  if (selectedTools.value.length === 0) return
  if (!store.projectPath) {
    message.error('项目路径为空')
    return
  }
  runningInit.value = true
  try {
    await initToolsApi(store.projectPath, selectedTools.value)
    message.success('工具初始化完成')
    showInitModal.value = false
    selectedTools.value = []
    await store.refreshTab('settings')
  } catch (err) {
    message.error('工具初始化失败')
  } finally {
    runningInit.value = false
  }
}
</script>

<style scoped>
.settings-tab {
  padding: 8px 4px;
}

.cli-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cli-loading {
  padding: 4px 0;
}

.tools-section {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
}

.section-title {
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px 12px;
}

.tools-empty {
  padding: 8px 0;
}

.tools-actions {
  margin-top: 12px;
}

.actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.modal-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
</style>
