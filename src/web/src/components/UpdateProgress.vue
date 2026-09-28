<template>
  <div class="progress-wrapper">
    <div class="progress-title">🚀 正在更新</div>

    <div class="steps">
      <div v-for="(step, index) in steps" :key="index" class="step-item">
        <span class="step-icon">
          <n-icon v-if="step.status === 'completed'" :size="16" class="icon-success">
            <CheckmarkCircleOutline />
          </n-icon>
          <n-icon v-else-if="step.status === 'failed'" :size="16" class="icon-fail">
            <CloseCircleOutline />
          </n-icon>
          <n-spin v-else-if="step.status === 'in_progress'" size="12" />
          <span v-else class="icon-pending">•</span>
        </span>
        <span class="step-text">{{ step.title }}</span>
      </div>
    </div>

    <n-progress
      type="line"
      :percentage="percentage"
      :show-indicator="false"
      height="6"
      class="progress-bar"
    />

    <div class="progress-footer">
      <span v-if="countdown !== null" class="success-text">
        更新完成，{{ countdown }} 秒后刷新
      </span>
      <span v-else-if="progress?.restartRequired" class="success-text">
        更新已安装，请重启服务后生效
      </span>
      <span v-else-if="progress?.status === 'failed'" class="fail-text">
        更新失败，请查看日志或手动更新
      </span>
      <span v-else class="progress-text">
        {{ progress?.message || '更新进行中...' }}
      </span>
    </div>

    <div v-if="progress?.error" class="error-block">{{ progress.error }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { NIcon, NProgress, NSpin } from 'naive-ui'
import { CheckmarkCircleOutline, CloseCircleOutline } from '@vicons/ionicons5'

const props = defineProps({
  progress: {
    type: Object,
    default: null
  },
  updating: {
    type: Boolean,
    default: false
  }
})

const countdown = ref(null)
let timer = null

const steps = computed(() => {
  if (props.progress?.steps?.length) {
    return props.progress.steps
  }
  return []
})

const percentage = computed(() => {
  if (typeof props.progress?.progress === 'number') {
    return props.progress.progress
  }
  return 0
})

function startCountdown() {
  countdown.value = 3
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      clearInterval(timer)
      timer = null
      window.location.reload()
    }
  }, 1000)
}

watch(
  () => props.progress?.status,
  (status) => {
    if (status === 'completed' && !props.progress?.restartRequired && countdown.value === null) {
      startCountdown()
    }
    if (status !== 'completed' && timer) {
      clearInterval(timer)
      timer = null
      countdown.value = null
    }
  }
)

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<style scoped>
.progress-wrapper {
  padding: 8px 0 4px;
}

.progress-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.steps {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.step-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-success {
  color: #18a058;
}

.icon-fail {
  color: #ef4444;
}

.icon-pending {
  color: var(--text-tertiary);
}

.progress-bar {
  margin-bottom: 8px;
}

.progress-footer {
  font-size: 12px;
  color: var(--text-secondary);
}

.success-text {
  color: #16a34a;
  font-weight: 500;
}

.fail-text {
  color: #ef4444;
  font-weight: 500;
}

.error-block {
  margin-top: 6px;
  background: rgba(239, 68, 68, 0.08);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 11px;
  color: #ef4444;
}
</style>
