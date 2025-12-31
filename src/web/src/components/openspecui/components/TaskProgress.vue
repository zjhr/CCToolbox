<template>
  <div
    class="task-progress"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <n-progress
      type="line"
      :percentage="safePercentage"
      :color="progressColor"
      :height="height"
      :border-radius="3"
      :show-indicator="false"
      :transition-duration="300"
    />
    <div v-if="showPercentage" class="progress-meta">
      <span class="progress-percent">{{ safePercentage }}%</span>
      <span v-if="showDetail" class="progress-detail">{{ done }}/{{ total }}</span>
    </div>
    <div v-if="showTooltip && tooltip" class="progress-tooltip">
      {{ tooltip }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { NProgress } from 'naive-ui'

const props = defineProps({
  percentage: {
    type: Number,
    default: 0
  },
  done: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  showPercentage: {
    type: Boolean,
    default: true
  },
  height: {
    type: Number,
    default: 6
  }
})

const showTooltip = ref(false)

const safePercentage = computed(() => {
  const value = Number.isFinite(props.percentage) ? props.percentage : 0
  return Math.min(100, Math.max(0, Math.round(value)))
})

const progressColor = computed(() => {
  if (safePercentage.value < 30) return '#ef4444'
  if (safePercentage.value < 70) return '#f59e0b'
  return '#10b981'
})

const showDetail = computed(() => {
  return Number.isFinite(props.total) && props.total > 0
})

const tooltip = computed(() => {
  if (!showDetail.value) return ''
  return `已完成 ${props.done}/${props.total} 个子任务`
})
</script>

<style scoped>
.task-progress {
  position: relative;
  width: 100%;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  color: #666;
}

.progress-percent {
  font-weight: 600;
}

.progress-detail {
  color: #8a5a2f;
}

.progress-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(17, 24, 39, 0.9);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
