<template>
  <n-drawer v-model:show="visible" :width="drawerWidth" placement="right" :auto-focus="false">
    <n-drawer-content class="drawer-content" :native-scrollbar="false">
      <template #header>
        <div class="drawer-header">
          <div class="header-title">
            <n-icon :size="20" class="header-icon">
              <DocumentTextOutline />
            </n-icon>
            <span>OpenSpec 管理</span>
            <n-tag v-if="projectName" size="small" :bordered="false" type="info">
              {{ projectName }}
            </n-tag>
          </div>
          <div class="header-actions">
            <n-button size="small" quaternary @click="handleRefresh" :loading="store.loading">
              <template #icon>
                <n-icon><RefreshOutline /></n-icon>
              </template>
              刷新
            </n-button>
            <n-text depth="3" class="sync-text">{{ syncText }}</n-text>
            <n-text depth="3" class="sync-text">{{ lastUpdatedText }}</n-text>
          </div>
        </div>
      </template>

      <div class="drawer-body">
        <n-tabs
          v-model:value="store.activeTab"
          type="line"
          size="small"
          class="drawer-tabs"
          @update:value="handleTabChange"
        >
          <n-tab-pane name="dashboard" tab="仪表盘">
            <div class="tab-panel">
              <DashboardTab />
            </div>
          </n-tab-pane>
          <n-tab-pane name="projects" tab="项目">
            <div class="tab-panel">
              <ProjectsTab />
            </div>
          </n-tab-pane>
          <n-tab-pane name="specs" tab="规范">
            <div class="tab-panel">
              <SpecsTab />
            </div>
          </n-tab-pane>
          <n-tab-pane name="changes" tab="变更">
            <div class="tab-panel">
              <ChangesTab />
            </div>
          </n-tab-pane>
          <n-tab-pane name="archives" tab="档案">
            <div class="tab-panel">
              <ArchivesTab />
            </div>
          </n-tab-pane>
          <n-tab-pane name="settings" tab="设置">
            <div class="tab-panel">
              <SettingsTab />
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { computed, watch } from 'vue'
import { NDrawer, NDrawerContent, NButton, NIcon, NTabs, NTabPane, NTag, NText } from 'naive-ui'
import { DocumentTextOutline, RefreshOutline } from '@vicons/ionicons5'
import { useResponsiveDrawer } from '../../composables/useResponsiveDrawer'
import { useOpenSpecStore } from '../../stores/openspec'
import { useOpenSpecSync } from '../../composables/useOpenSpecSync'
import { useOpenSpecRefresh } from '../../composables/useOpenSpecRefresh'
import DashboardTab from './tabs/DashboardTab.vue'
import ProjectsTab from './tabs/ProjectsTab.vue'
import SpecsTab from './tabs/SpecsTab.vue'
import ChangesTab from './tabs/ChangesTab.vue'
import ArchivesTab from './tabs/ArchivesTab.vue'
import SettingsTab from './tabs/SettingsTab.vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  projectName: {
    type: String,
    default: ''
  },
  projectPath: {
    type: String,
    default: ''
  },
  channel: {
    type: String,
    default: 'claude'
  }
})

const emit = defineEmits(['update:show'])
const store = useOpenSpecStore()

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

const { drawerWidth } = useResponsiveDrawer(1200, 960)
const { connect, disconnect } = useOpenSpecSync()
useOpenSpecRefresh(visible)

const syncText = computed(() => {
  if (store.syncStatus === 'syncing') return '同步中...'
  if (store.syncStatus === 'conflict') return '存在冲突'
  if (store.syncStatus === 'error') return '同步失败'
  if (store.syncStatus === 'synced') return '已同步'
  return '待同步'
})

const lastUpdatedText = computed(() => {
  if (!store.lastUpdated) return '未更新'
  return `上次更新 ${formatTime(store.lastUpdated)}`
})

function handleTabChange(tab) {
  store.setActiveTab(tab)
  store.refreshTab(tab)
}

function handleRefresh() {
  store.refreshTab(store.activeTab)
}

function formatTime(ts) {
  return new Date(ts).toLocaleString()
}

watch(visible, async (val) => {
  store.setDrawerOpen(val)
  if (val) {
    if (!props.projectPath) {
      console.error('OpenSpec 项目路径为空')
      return
    }
    store.setActiveTab('dashboard')
    store.setContext({
      name: props.projectName,
      path: props.projectPath,
      source: props.channel
    })
    try {
      await store.refreshAll()
    } catch (err) {
      console.error('OpenSpec 初始化失败:', err)
    }
    connect()
  } else {
    disconnect()
  }
})

watch(
  () => props.projectPath,
  (newPath) => {
    if (visible.value && newPath) {
      store.setContext({
        name: props.projectName,
        path: newPath,
        source: props.channel
      })
      store.refreshAll().catch((err) => {
        console.error('OpenSpec 刷新失败:', err)
      })
    }
  }
)
</script>

<style scoped>
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #18a058;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sync-text {
  font-size: 12px;
  color: #666;
}

.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.drawer-content :deep(.n-drawer-body),
.drawer-content :deep(.n-drawer-body-content-wrapper) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.drawer-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.drawer-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.drawer-tabs :deep(.n-tabs-content),
.drawer-tabs :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  min-height: 0;
}

.drawer-tabs :deep(.n-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.tab-panel {
  height: 100%;
  min-height: 0;
  overflow: auto;
}
</style>
