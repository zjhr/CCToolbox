<template>
  <n-drawer v-model:show="visible" :width="drawerWidth" placement="right" :auto-focus="false">
    <n-drawer-content class="drawer-content" :native-scrollbar="false">
      <template #header>
        <div class="drawer-header">
          <div class="header-title">
            <n-icon :size="20" class="header-icon">
              <SparklesOutline />
            </n-icon>
            <span>Serena 管理</span>
            <n-tag v-if="projectName" size="small" :bordered="false" type="info">
              {{ projectName }}
            </n-tag>
          </div>
          <div class="header-actions">
            <n-button size="small" quaternary @click="handleRefresh" :loading="store.loading.overview">
              <template #icon>
                <n-icon><RefreshOutline /></n-icon>
              </template>
              刷新
            </n-button>
            <n-text depth="3" class="sync-text">{{ healthText }}</n-text>
            <n-text depth="3" class="sync-text">{{ lastUpdatedText }}</n-text>
          </div>
        </div>
      </template>

      <div class="drawer-body">
        <n-alert
          v-if="!store.health.hasSerena"
          type="warning"
          title="Serena 未配置"
          style="margin-bottom: 12px;"
        >
          <div class="guide-content">
            <div v-if="store.health.message" class="guide-hint">{{ store.health.message }}</div>
            <div>请在项目根目录完成以下步骤：</div>
            <ol>
              <li>创建 `.serena` 文件夹</li>
              <li>配置 `project.yml`</li>
              <li>重启 Claude Code / Codex CLI</li>
            </ol>
          </div>
        </n-alert>

        <n-tabs
          v-if="store.health.hasSerena"
          v-model:value="store.activeTab"
          type="line"
          size="small"
          class="drawer-tabs"
          @update:value="handleTabChange"
        >
          <n-tab-pane name="overview" tab="项目概览">
            <div class="tab-panel">
              <OverviewTab />
            </div>
          </n-tab-pane>
          <n-tab-pane name="memories" tab="记忆管理">
            <div class="tab-panel">
              <MemoriesTab />
            </div>
          </n-tab-pane>
          <n-tab-pane name="browser" tab="语义浏览器">
            <div class="tab-panel">
              <BrowserTab />
            </div>
          </n-tab-pane>
        </n-tabs>
        <n-empty v-else description="请先完成 Serena 配置" />
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { computed, watch } from 'vue'
import { NDrawer, NDrawerContent, NButton, NIcon, NTabs, NTabPane, NTag, NText, NAlert, NEmpty } from 'naive-ui'
import { SparklesOutline, RefreshOutline } from '@vicons/ionicons5'
import { useResponsiveDrawer } from '../../composables/useResponsiveDrawer'
import { useSerenaStore } from '../../stores/serena'
import OverviewTab from './tabs/OverviewTab.vue'
import MemoriesTab from './tabs/MemoriesTab.vue'
import BrowserTab from './tabs/BrowserTab.vue'

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
const store = useSerenaStore()

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

const { drawerWidth } = useResponsiveDrawer(1200, 960)

const healthText = computed(() => {
  if (store.loading.health) return '检测中...'
  return store.health.hasSerena ? '已连接' : '未配置'
})

const lastUpdatedText = computed(() => {
  if (!store.lastUpdated) return '未更新'
  return `上次更新 ${formatTime(store.lastUpdated)}`
})

function handleTabChange(tab) {
  store.setActiveTab(tab)
}

async function handleRefresh() {
  try {
    await store.refreshAll()
  } catch (err) {
    console.error('Serena 刷新失败:', err)
  }
}

function formatTime(ts) {
  return new Date(ts).toLocaleString()
}

watch(visible, async (val) => {
  store.setDrawerOpen(val)
  if (val) {
    if (!props.projectPath) {
      console.error('Serena 项目路径为空')
      return
    }
    store.setActiveTab('overview')
    store.setContext({
      name: props.projectName,
      path: props.projectPath,
      source: props.channel
    })
    try {
      await store.refreshAll()
      store.startCachePolling()
    } catch (err) {
      console.error('Serena 初始化失败:', err)
    }
  } else {
    store.stopCachePolling()
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
      store.refreshAll()
        .then(() => {
          store.startCachePolling()
        })
        .catch((err) => {
          console.error('Serena 刷新失败:', err)
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
  color: #7c3aed;
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
  padding: 6px 4px;
}

.drawer-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.drawer-tabs :deep(.n-tabs-content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.drawer-tabs :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.drawer-tabs :deep(.n-tab-pane) {
  height: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tab-panel {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 8px 4px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.guide-content {
  font-size: 13px;
  color: #4b5563;
}

.guide-hint {
  margin-bottom: 6px;
  color: #b45309;
}

.guide-content ol {
  padding-left: 18px;
  margin: 6px 0 0 0;
}
</style>
