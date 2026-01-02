<template>
  <n-card
    class="session-summary-card"
    :segmented="{ content: true }"
    size="small"
    :title="null"
  >
    <div class="card-header" @click="expanded = !expanded">
      <div class="header-left">
        <n-icon :size="18" :component="SummaryIcon" class="summary-icon" />
        <span class="title">会话总结</span>
        <n-tag v-if="summaryData?.modelUsed" size="tiny" :bordered="false" type="info" class="model-tag">
          {{ summaryData.modelUsed }}
        </n-tag>
      </div>
      <div class="header-right">
        <span v-if="summaryData?.generatedAt" class="time">{{ formatTime(summaryData.generatedAt) }}</span>
        <n-button
          v-if="summaryData?.summary"
          quaternary
          circle
          size="tiny"
          :loading="loading"
          @click.stop="handleRefresh"
          title="重新生成"
        >
          <template #icon>
            <n-icon :component="RefreshIcon" />
          </template>
        </n-button>
        <n-button
          v-else
          size="tiny"
          type="primary"
          :loading="loading"
          :disabled="disabled"
          @click.stop="handleSummarize"
        >
          生成
        </n-button>
        <n-icon
          :size="16"
          :component="expanded ? ChevronUpIcon : ChevronDownIcon"
          class="expand-icon"
        />
      </div>
    </div>

    <n-collapse-transition :show="expanded">
      <div class="card-content">
        <n-spin :show="loading">
          <div v-if="summaryData?.summary" class="summary-body markdown-body" v-html="renderedMarkdown"></div>
          <n-empty v-else-if="!loading" description="暂无总结">
            <template #extra>
              <n-button
                size="small"
                type="primary"
                @click="handleSummarize"
                :disabled="disabled"
              >
                生成总结
              </n-button>
            </template>
          </n-empty>
          <div v-else class="loading-placeholder"></div>
        </n-spin>
      </div>
    </n-collapse-transition>
  </n-card>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import {
  NCard, NButton, NIcon, NSpin, NEmpty, NTag, NCollapseTransition
} from 'naive-ui'
import {
  DocumentTextOutline as SummaryIcon,
  RefreshOutline as RefreshIcon,
  ChevronDownOutline as ChevronDownIcon,
  ChevronUpOutline as ChevronUpIcon
} from '@vicons/ionicons5'
import { marked } from 'marked'
import hljs from 'highlight.js/lib/core'

// Import commonly used languages
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import typescript from 'highlight.js/lib/languages/typescript'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'

// Register languages
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)

import { getSessionSummary, summarizeSession } from '../api/ai'
import message from '../utils/message'

const props = defineProps({
  projectName: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const loading = ref(false)
const expanded = ref(false)
const summaryData = ref(null)

// Configure marked
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch (err) {
        console.error('Highlight error:', err)
      }
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
  gfm: true
})

const renderedMarkdown = computed(() => {
  if (summaryData.value?.summary) {
    try {
      return marked.parse(summaryData.value.summary)
    } catch (err) {
      console.error('Markdown parse error:', err)
      return summaryData.value.summary
    }
  }
  return ''
})

async function fetchSummary() {
  if (!props.projectName || !props.sessionId) return
  loading.value = true
  try {
    const res = await getSessionSummary(props.projectName, props.sessionId)
    if (res?.success) {
      summaryData.value = res.data || null
    } else {
      summaryData.value = null
    }
  } catch (err) {
    console.error('Failed to fetch summary:', err)
    message.error('加载总结失败: ' + (err.response?.data?.error || err.message))
  } finally {
    loading.value = false
  }
}

async function handleSummarize() {
  if (loading.value || props.disabled) return
  loading.value = true
  try {
    const res = await summarizeSession({
      projectName: props.projectName,
      sessionId: props.sessionId
    })
    if (res?.success) {
      summaryData.value = res.data || null
      expanded.value = true
      message.success('总结生成成功')
    } else {
      message.error(res?.error || '生成总结失败')
    }
  } catch (err) {
    console.error('Failed to summarize session:', err)
    message.error('生成总结失败: ' + (err.response?.data?.error || err.message))
  } finally {
    loading.value = false
  }
}

function handleRefresh() {
  handleSummarize()
}

defineExpose({
  summarize: handleSummarize,
  refresh: handleRefresh
})

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  fetchSummary()
})

watch(() => props.sessionId, () => {
  summaryData.value = null
  expanded.value = false
  fetchSummary()
})
</script>

<style scoped>
.session-summary-card {
  margin-bottom: 12px;
  border: 1px solid var(--n-border-color);
  background: var(--n-color-embedded);
  border-radius: 8px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}

.card-header:hover {
  background: rgba(0, 0, 0, 0.02);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-icon {
  color: var(--n-primary-color);
}

.title {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
}

.model-tag {
  font-size: 10px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.expand-icon {
  color: var(--n-text-color-3);
  transition: transform 0.3s;
}

.card-content {
  padding: 0 12px 12px;
}

.summary-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--n-text-color-2);
}

.loading-placeholder {
  height: 60px;
}

/* Markdown styles */
.markdown-body {
  font-size: 13px;
  line-height: 1.5;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: 8px;
  margin-bottom: 4px;
  font-weight: 600;
  line-height: 1.3;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h1) { font-size: 1.5em; }
.markdown-body :deep(h2) { font-size: 1.3em; }
.markdown-body :deep(h3) { font-size: 1.15em; }

.markdown-body :deep(p) {
  margin-bottom: 6px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(code) {
  padding: 2px 6px;
  background: var(--n-code-color);
  border-radius: 3px;
  font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  margin: 6px 0;
  padding: 8px;
  background: var(--n-code-color);
  border-radius: 6px;
  overflow-x: auto;
  max-width: 100%;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 12px;
  line-height: 1.5;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin-bottom: 6px;
  padding-left: 18px;
}

.markdown-body :deep(li) {
  margin-bottom: 2px;
}

.markdown-body :deep(blockquote) {
  margin: 6px 0;
  padding: 4px 10px;
  border-left: 4px solid var(--n-border-color);
  background: var(--n-color-embedded);
  color: var(--n-text-color-2);
}

/* Code highlighting */
.markdown-body :deep(.hljs) {
  color: var(--n-text-color);
  background: var(--n-code-color);
}

.markdown-body :deep(.hljs-keyword),
.markdown-body :deep(.hljs-selector-tag),
.markdown-body :deep(.hljs-literal),
.markdown-body :deep(.hljs-section),
.markdown-body :deep(.hljs-link) {
  color: #c678dd;
}

.markdown-body :deep(.hljs-string),
.markdown-body :deep(.hljs-attr),
.markdown-body :deep(.hljs-template-variable),
.markdown-body :deep(.hljs-addition) {
  color: #98c379;
}

.markdown-body :deep(.hljs-number),
.markdown-body :deep(.hljs-symbol),
.markdown-body :deep(.hljs-bullet),
.markdown-body :deep(.hljs-meta) {
  color: #d19a66;
}

.markdown-body :deep(.hljs-function),
.markdown-body :deep(.hljs-built_in) {
  color: #61afef;
}

.markdown-body :deep(.hljs-comment),
.markdown-body :deep(.hljs-quote) {
  color: #5c6370;
  font-style: italic;
}
</style>
