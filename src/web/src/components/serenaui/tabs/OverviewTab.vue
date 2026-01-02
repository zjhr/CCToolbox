<template>
  <div class="overview-tab">
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-title">
          <n-icon :size="18"><BookmarksOutline /></n-icon>
          <span>记忆</span>
        </div>
        <div class="stat-value">{{ overview?.memoryCount ?? 0 }}</div>
        <div class="stat-sub">已记录</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">
          <n-icon :size="18"><FolderOpenOutline /></n-icon>
          <span>文件</span>
        </div>
        <div class="stat-value">{{ overview?.fileCount ?? 0 }}</div>
        <div class="stat-sub">检测到</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">
          <n-icon :size="18"><CodeSlashOutline /></n-icon>
          <span>语言</span>
        </div>
        <div class="stat-value">{{ overview?.language || '未知' }}</div>
        <div class="stat-sub">主语言</div>
      </div>
    </div>

    <n-grid class="overview-grid" :cols="2" :x-gap="12" :y-gap="12" responsive="screen">
      <n-grid-item>
        <n-card size="small" title="基础信息">
          <n-descriptions :column="1" size="small">
            <n-descriptions-item label="项目名称">
              {{ overview?.projectName || store.projectName || '未命名' }}
            </n-descriptions-item>
            <n-descriptions-item label="项目路径">
              {{ overview?.projectPath || store.projectPath || '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="编码">
              {{ overview?.encoding || 'utf-8' }}
            </n-descriptions-item>
            <n-descriptions-item label="只读模式">
              {{ overview?.readOnly ? '已启用' : '未启用' }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card size="small" title="目录结构">
          <n-tree
            :data="treeData"
            default-expand-all
            key-field="key"
            label-field="label"
            children-field="children"
            class="overview-tree"
          />
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NIcon, NCard, NDescriptions, NDescriptionsItem, NTree, NGrid, NGridItem } from 'naive-ui'
import { BookmarksOutline, FolderOpenOutline, CodeSlashOutline } from '@vicons/ionicons5'
import { useSerenaStore } from '../../../stores/serena'

const store = useSerenaStore()
const overview = computed(() => store.overview)

const treeData = computed(() => {
  const nodes = overview.value?.structure || []
  const build = (items) => items.map(item => ({
    key: item.path,
    label: item.name,
    children: item.type === 'directory' ? build(item.children || []) : undefined
  }))
  return build(nodes)
})
</script>

<style scoped>
.overview-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  flex: 1;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: stretch;
}

.stat-card {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 96px;
}

.stat-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}

.stat-value {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 600;
  color: #111827;
}

.stat-sub {
  font-size: 12px;
  color: #9ca3af;
}

.overview-grid {
  flex: 1;
  min-height: 0;
  height: 100%;
  grid-auto-rows: minmax(0, 1fr);
  align-content: stretch;
}

.overview-grid :deep(.n-grid-item) {
  display: flex;
}

.overview-grid :deep(.n-card) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.overview-grid :deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.overview-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  height: 100%;
}
</style>
