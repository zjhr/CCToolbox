<template>
  <div
    class="spec-card spec-card--temporary"
    :class="{ disabled }"
    role="button"
    tabindex="0"
    :aria-disabled="disabled ? 'true' : 'false'"
    :aria-label="ariaLabel"
    @click="handleOpen"
    @keydown="handleKeydown"
  >
    <div class="spec-info">
      <div class="spec-title" v-html="titleHtml" />
      <div class="spec-badges">
        <n-tag class="spec-badge" type="warning" size="small">临时</n-tag>
        <span v-if="sourceLabel" class="spec-source">{{ sourceLabel }}</span>
      </div>
      <div v-if="snippetHtml" class="spec-snippet" v-html="snippetHtml" />
      <div class="spec-meta">
        {{ metaText }}
      </div>
    </div>
    <div class="spec-count">
      {{ requirementText }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NTag } from 'naive-ui'

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  titleHtml: {
    type: String,
    default: ''
  },
  snippetHtml: {
    type: String,
    default: ''
  },
  metaText: {
    type: String,
    default: ''
  },
  requirementText: {
    type: String,
    default: ''
  },
  sourceLabel: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['open'])

const ariaLabel = computed(() => {
  const name = props.item?.name || ''
  const changeId = props.item?.changeId || ''
  if (!name || !changeId) return '临时规范'
  return `临时规范：${name}，来自 ${changeId}`
})

function handleOpen() {
  emit('open', props.item)
}

function handleKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    handleOpen()
  }
}
</script>

<style scoped>
.spec-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.spec-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
  box-shadow: none;
}

.spec-card--temporary {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 2px solid #fbbf24;
}

.spec-card--temporary:hover {
  background: #fde68a;
  border-color: #f59e0b;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
  transform: translateY(-2px);
}

.spec-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spec-title {
  font-size: 14px;
  font-weight: 600;
}

.spec-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.spec-badge {
  background: #f59e0b;
  color: #fff;
}

.spec-source {
  color: #6b7280;
  font-size: 12px;
}

.spec-meta {
  font-size: 12px;
  color: #666;
}

.spec-snippet {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.spec-snippet :deep(.search-highlight),
.spec-title :deep(.search-highlight) {
  background: #fde68a;
  color: #7a4a1f;
  padding: 0 2px;
  border-radius: 4px;
}

.spec-count {
  font-size: 12px;
  color: #8a5a2f;
  padding: 4px 8px;
  border-radius: 999px;
  background: #fff4e6;
  border: 1px solid #f0d9bb;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .spec-source {
    display: none;
  }
}
</style>
