<template>
  <div class="diff-viewer">
    <pre>
      <div v-for="(line, index) in lines" :key="index" :class="getLineClass(line)">
        {{ line }}
      </div>
    </pre>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  diff: {
    type: String,
    default: ''
  }
})

const lines = computed(() => {
  return props.diff ? props.diff.split('\n') : []
})

function getLineClass(line) {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
    return 'diff-meta'
  }
  if (line.startsWith('+')) return 'diff-add'
  if (line.startsWith('-')) return 'diff-remove'
  return ''
}
</script>

<style scoped>
.diff-viewer {
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 8px;
  max-height: 260px;
  overflow: auto;
}

.diff-viewer pre {
  margin: 0;
  font-family: 'SFMono-Regular', ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.diff-add {
  color: #86efac;
}

.diff-remove {
  color: #fca5a5;
}

.diff-meta {
  color: #93c5fd;
}
</style>
