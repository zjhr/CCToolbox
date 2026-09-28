<template>
  <div class="update-panel">
    <div class="panel-header">✨ 发现新版本</div>

    <div class="version-row">
      <div class="version-card">
        <div class="label">当前版本</div>
        <div class="value">{{ current || '-' }}</div>
        <div v-if="showCommitDetails" class="commit-id">{{ currentCommit.slice(0, 7) }}</div>
      </div>
      <div class="arrow">→</div>
      <div class="version-card latest">
        <div class="label">最新版本</div>
        <div class="value">{{ remote || '-' }}</div>
        <div v-if="showCommitDetails" class="commit-id">{{ latestCommit.slice(0, 7) }}</div>
      </div>
    </div>

    <UpdateProgress
      v-if="progress || updating"
      :progress="progress"
      :updating="updating"
    />

    <div v-else class="actions">
      <n-button type="primary" size="small" @click="$emit('update')">
        立即更新
      </n-button>
      <n-button size="small" @click="$emit('dismiss')">
        稍后提醒
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import UpdateProgress from './UpdateProgress.vue'

const props = defineProps({
  current: {
    type: String,
    default: null
  },
  remote: {
    type: String,
    default: null
  },
  currentCommit: {
    type: String,
    default: null
  },
  latestCommit: {
    type: String,
    default: null
  },
  updating: {
    type: Boolean,
    default: false
  },
  progress: {
    type: Object,
    default: null
  }
})

const showCommitDetails = computed(() =>
  Boolean(
    props.current &&
    props.current === props.remote &&
    props.currentCommit &&
    props.latestCommit &&
    props.currentCommit !== props.latestCommit
  )
)

defineEmits(['update', 'dismiss'])
</script>

<style scoped>
.update-panel {
  width: 320px;
  padding: 14px 16px 16px;
}

.panel-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.version-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.version-card {
  flex: 1;
  background: rgba(24, 160, 88, 0.08);
  border-radius: 8px;
  padding: 8px 10px;
}

.version-card.latest {
  background: rgba(59, 130, 246, 0.1);
}

.label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.commit-id {
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: 10px;
  font-family: var(--font-mono, monospace);
}

.arrow {
  color: var(--text-secondary);
  font-size: 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
