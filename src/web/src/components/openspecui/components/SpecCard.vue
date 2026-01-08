<template>
  <div
    class="spec-card"
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
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['open'])

const ariaLabel = computed(() => {
  const name = props.item?.name || ''
  if (!name) return '规范'
  return `规范：${name}`
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
  border: 2px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.spec-card:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.12);
  transform: translateY(-2px);
}

.spec-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
  box-shadow: none;
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
</style>
