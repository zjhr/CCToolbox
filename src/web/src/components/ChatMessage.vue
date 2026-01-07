<template>
  <div class="chat-message" :class="[`message-${messageRole}`, modelClass]">
    <div class="message-header">
      <template v-if="messageRole === 'assistant'">
        <n-icon :size="16" :component="RobotIcon" class="role-icon" />
        <span class="message-role">AI</span>
        <span v-if="modelLabel" class="message-model">{{ modelLabel }}</span>
        <span class="message-time">{{ message.timestamp ? formatTime(message.timestamp) : '' }}</span>
        <span class="spacer"></span>
        <span class="copy-btn" :class="{ copied }" @click="copyContent" :title="copyTitle">
          <n-icon :size="14" :component="copyIcon" />
        </span>
      </template>
      <template v-else-if="messageRole === 'tool'">
        <n-icon :size="16" :component="ToolIcon" class="role-icon" />
        <span class="message-role">工具调用</span>
        <span v-if="modelLabel" class="message-model">{{ modelLabel }}</span>
        <span class="message-time">{{ message.timestamp ? formatTime(message.timestamp) : '' }}</span>
        <span class="spacer"></span>
        <span class="copy-btn" :class="{ copied }" @click="copyContent" :title="copyTitle">
          <n-icon :size="14" :component="copyIcon" />
        </span>
      </template>
      <template v-else-if="messageRole === 'thinking'">
        <n-icon :size="16" :component="RobotIcon" class="role-icon" />
        <span class="message-role">思考</span>
        <span v-if="modelLabel" class="message-model">{{ modelLabel }}</span>
        <span class="message-time">{{ message.timestamp ? formatTime(message.timestamp) : '' }}</span>
        <span class="spacer"></span>
        <span class="copy-btn" :class="{ copied }" @click="copyContent" :title="copyTitle">
          <n-icon :size="14" :component="copyIcon" />
        </span>
      </template>
      <template v-else>
        <span class="copy-btn" :class="{ copied }" @click="copyContent" :title="copyTitle">
          <n-icon :size="14" :component="copyIcon" />
        </span>
        <span class="spacer"></span>
        <span class="message-time">{{ message.timestamp ? formatTime(message.timestamp) : '' }}</span>
        <span class="message-role">用户</span>
        <n-icon :size="16" :component="PersonIcon" class="role-icon" />
      </template>
    </div>
    <div
      class="message-content"
      :class="{ collapsed: !expanded && isLongContent, 'thinking-content': messageRole === 'thinking' }"
    >
      <!-- User message: plain text or array content -->
      <div v-if="messageRole === 'user'" class="user-content">
        <template v-if="typeof messageContent === 'string'">
          {{ expanded ? messageContent : truncatedContent }}
        </template>
        <template v-else-if="Array.isArray(messageContent)">
          <div v-for="(item, index) in displayArray" :key="index" class="content-item">
            <div v-if="item.type === 'text'">{{ item.text }}</div>
            <div v-else-if="item.type === 'image'" class="image-item">
              <template v-if="getImageSrc(item)">
                <img :src="getImageSrc(item)" alt="会话图片" loading="lazy" />
              </template>
              <template v-else>
                <n-icon :size="20" :component="ImageIcon" />
                <span>图片内容</span>
              </template>
            </div>
          </div>
        </template>
      </div>
      <!-- Assistant message: Markdown rendered -->
      <div
        v-else-if="messageRole === 'assistant'"
        class="assistant-content markdown-body"
        v-html="expanded ? renderedMarkdown : truncatedMarkdown"
      ></div>
      <!-- Tool message -->
      <div v-else-if="messageRole === 'tool'" class="tool-content">
        <ToolCallRenderer :tool-calls="message.toolCalls || []" />
      </div>
      <!-- Thinking message -->
      <div v-else-if="messageRole === 'thinking'" class="thinking-text">
        {{ expanded ? messageContent : truncatedContent }}
      </div>
    </div>
    <!-- Expand button -->
    <div v-if="isLongContent" class="expand-btn" @click="expanded = !expanded">
      {{ expanded ? '收起' : '展开全部' }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import { NIcon } from 'naive-ui'
import { Person as PersonIcon, Chatbubbles as RobotIcon, Image as ImageIcon, Copy as CopyIcon, BuildOutline as ToolIcon, Checkmark as CheckmarkIcon } from '@vicons/ionicons5'
import { marked } from 'marked'
import hljs from 'highlight.js/lib/core'
import ToolCallRenderer from './chat/ToolCallRenderer.vue'

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

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

const messageRole = computed(() => props.message.role || props.message.type || 'assistant')
const messageContent = computed(() => props.message.content ?? '')
const arrayContent = computed(() => Array.isArray(messageContent.value) ? messageContent.value : [])
const arrayPreview = computed(() => buildArrayPreview(arrayContent.value))

const normalizedModel = computed(() => {
  const raw = (props.message.model || '').toString().toLowerCase()
  if (raw.includes('claude') || raw.includes('anthropic')) return 'claude'
  if (raw.includes('gemini')) return 'gemini'
  if (raw.includes('gpt') || raw.includes('openai') || raw.includes('codex')) return 'codex'
  if (raw === 'claude' || raw === 'codex' || raw === 'gemini') return raw
  return props.message.model ? raw : ''
})

const modelLabel = computed(() => {
  if (!normalizedModel.value) return ''
  return normalizedModel.value.toUpperCase()
})

const modelClass = computed(() => {
  if (!normalizedModel.value) return ''
  return `model-${normalizedModel.value}`
})

// Expand/collapse state
const expanded = ref(false)
const MAX_LENGTH = 360
const MAX_LINES = 8
const ARRAY_LIMIT = 3
const ARRAY_TEXT_LIMIT = 120
const copied = ref(false)
let copyTimer = null
const copyIcon = computed(() => copied.value ? CheckmarkIcon : CopyIcon)
const copyTitle = computed(() => copied.value ? '已复制' : '复制')

// Check if content is long
const isLongContent = computed(() => {
  if (messageRole.value === 'tool') return false
  const content = messageContent.value
  if (typeof content === 'string') {
    return isLongText(content)
  }
  if (Array.isArray(content)) {
    return arrayPreview.value.truncated
  }
  return false
})

// Truncated content for user messages
const truncatedContent = computed(() => {
  const content = messageContent.value
  if (typeof content === 'string' && content.length > MAX_LENGTH) {
    return truncateText(content)
  }
  if (typeof content === 'string' && content.split('\n').length > MAX_LINES) {
    return truncateText(content)
  }
  return content
})

const displayArray = computed(() => {
  if (!Array.isArray(messageContent.value)) return []
  if (expanded.value || !arrayPreview.value.truncated) return messageContent.value
  return arrayPreview.value.items
})

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

// Render markdown (full)
const renderedMarkdown = computed(() => {
  if (messageRole.value === 'assistant' && messageContent.value) {
    try {
      return marked.parse(messageContent.value)
    } catch (err) {
      console.error('Markdown parse error:', err)
      return messageContent.value
    }
  }
  return ''
})

// Render markdown (truncated)
const truncatedMarkdown = computed(() => {
  if (messageRole.value === 'assistant' && messageContent.value) {
    try {
      const content = messageContent.value
      const truncated = truncateText(content)
      return marked.parse(truncated)
    } catch (err) {
      return truncateText(messageContent.value)
    }
  }
  return ''
})

// Format timestamp
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Copy content
async function copyContent() {
  const text = messageRole.value === 'tool'
    ? JSON.stringify(props.message.toolCalls || [], null, 2)
    : typeof messageContent.value === 'string'
      ? messageContent.value
      : JSON.stringify(messageContent.value, null, 2)
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
      copyTimer = null
    }, 1200)
  } catch (err) {
    copied.value = false
    console.error('复制失败:', err)
  }
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})

function isLongText(text) {
  if (!text) return false
  const lineCount = text.split('\n').length
  return text.length > MAX_LENGTH || lineCount > MAX_LINES
}

function truncateText(text) {
  if (!text) return ''
  const lines = text.split('\n')
  if (lines.length > MAX_LINES) {
    return `${lines.slice(0, MAX_LINES).join('\n')}\n...`
  }
  if (text.length > MAX_LENGTH) {
    return text.substring(0, MAX_LENGTH) + '...'
  }
  return text
}

function buildArrayPreview(items) {
  if (!Array.isArray(items)) return { items: [], truncated: false }
  let truncated = false
  const preview = items.slice(0, ARRAY_LIMIT).map((item) => {
    if (item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string') {
      if (item.text.length > ARRAY_TEXT_LIMIT) {
        truncated = true
        return { ...item, text: item.text.substring(0, ARRAY_TEXT_LIMIT) + '...' }
      }
    }
    if (typeof item === 'string') {
      if (item.length > ARRAY_TEXT_LIMIT) {
        truncated = true
        return { type: 'text', text: item.substring(0, ARRAY_TEXT_LIMIT) + '...' }
      }
      return { type: 'text', text: item }
    }
    return item
  })
  const remaining = items.length - ARRAY_LIMIT
  if (remaining > 0) {
    truncated = true
    preview.push({ type: 'text', text: `... 还有 ${remaining} 项 ...` })
  }
  return { items: preview, truncated }
}

function getImageSrc(item) {
  if (!item) return null
  if (item.source?.type === 'base64' && item.source?.data) {
    const mediaType = item.source.media_type || 'image/png'
    return `data:${mediaType};base64,${item.source.data}`
  }
  if (item.source?.type === 'url' && item.source?.url) {
    return item.source.url
  }
  if (item.url) {
    return item.url
  }
  return null
}
</script>

<style scoped>
.chat-message {
  width: 100%;
  padding: 12px 16px;
  border-radius: 8px;
  box-sizing: border-box;
  border-left: 3px solid transparent;
}

.message-user {
  background: linear-gradient(135deg, #667eea08 0%, #764ba208 100%);
  border: 1px solid #667eea20;
  border-left-width: 3px;
}

.message-assistant {
  background: linear-gradient(135deg, #18a05808 0%, #0ea5e908 100%);
  border: 1px solid #18a05820;
  border-left-width: 3px;
}

.message-tool {
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-left-color: #3b82f6;
  border-left-width: 3px;
}

.message-thinking {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-left-width: 3px;
}

.model-claude {
  border-left-color: #7c3aed;
}

.model-codex {
  border-left-color: #10b981;
}

.model-gemini {
  border-left-color: #f59e0b;
}

.chat-message.message-tool {
  border-left-color: #3b82f6;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.message-user .message-header {
  justify-content: flex-end;
}

.message-assistant .message-header,
.message-tool .message-header,
.message-thinking .message-header {
  justify-content: flex-start;
}

.role-icon {
  color: var(--n-text-color-3);
}

.message-role {
  font-weight: 600;
  font-size: 12px;
  color: var(--n-text-color-2);
}

.message-model {
  font-size: 10px;
  color: var(--n-text-color-3);
  font-weight: 400;
  padding: 1px 5px;
  background: var(--n-color-embedded);
  border-radius: 3px;
}

.message-time {
  font-size: 11px;
  color: var(--n-text-color-3);
}

.spacer {
  flex: 1;
}

.copy-btn {
  opacity: 0;
  cursor: pointer;
  color: var(--n-text-color-3);
  transition: all 0.2s;
  padding: 2px;
}

.chat-message:hover .copy-btn {
  opacity: 1;
}

.copy-btn:hover {
  color: var(--n-text-color);
}

.copy-btn.copied {
  color: #22c55e;
}

.message-content {
  font-size: 13px;
  line-height: 1.5;
  color: var(--n-text-color);
  overflow-x: hidden;
  word-break: break-word;
}

.thinking-content,
.thinking-text {
  font-style: italic;
  color: var(--n-text-color-2);
  white-space: pre-wrap;
}

.tool-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.user-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.content-item {
  margin-bottom: 8px;
}

.image-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--n-color-embedded);
  border-radius: 4px;
  color: var(--n-text-color-2);
  font-size: 12px;
}

.image-item img {
  max-width: 100%;
  border-radius: 6px;
  display: block;
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
.markdown-body :deep(h4) { font-size: 1.05em; }

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
  word-break: break-word;
  overflow-wrap: anywhere;
}

.markdown-body :deep(pre) {
  margin: 6px 0;
  padding: 8px;
  background: var(--n-code-color);
  border-radius: 6px;
  overflow-x: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 100%;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
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

.markdown-body :deep(a) {
  color: var(--n-color-target);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  table-layout: fixed;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.markdown-body :deep(table th),
.markdown-body :deep(table td) {
  padding: 8px 12px;
  border: 1px solid var(--n-border-color);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.markdown-body :deep(table th) {
  background: var(--n-color-embedded);
  font-weight: 600;
}

.markdown-body :deep(hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid var(--n-border-color);
}

/* Code highlighting (basic theme) */
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

.markdown-body :deep(.hljs-title),
.markdown-body :deep(.hljs-section),
.markdown-body :deep(.hljs-class .hljs-title) {
  color: #e5c07b;
}

.markdown-body :deep(.hljs-function),
.markdown-body :deep(.hljs-built_in) {
  color: #61afef;
}

.markdown-body :deep(.hljs-comment),
.markdown-body :deep(.hljs-quote),
.markdown-body :deep(.hljs-deletion) {
  color: #5c6370;
  font-style: italic;
}

/* Expand/collapse */
.message-content.collapsed {
  max-height: 200px;
  overflow: hidden;
  position: relative;
}

.message-content.collapsed::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
  background: linear-gradient(transparent, var(--n-color));
  pointer-events: none;
}

.message-thinking .message-content.collapsed::after {
  background: linear-gradient(transparent, #f3f4f6);
}

.expand-btn {
  margin-top: 8px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--n-primary-color);
  cursor: pointer;
  text-align: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.expand-btn:hover {
  background: var(--n-color-embedded);
}

/* ========== 响应式样式 ========== */

/* 平板端 (768px - 1024px) */
@media (max-width: 1024px) {
  .chat-message {
    padding: 10px 14px;
  }

  .message-content {
    font-size: 12px;
  }

  .markdown-body {
    font-size: 12px;
  }

  .markdown-body :deep(pre code) {
    font-size: 11px;
  }
}

/* 小屏幕 (640px - 768px) */
@media (max-width: 768px) {
  .chat-message {
    padding: 8px 12px;
    margin-bottom: 6px;
    border-radius: 6px;
  }

  .message-header {
    gap: 4px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .message-role {
    font-size: 11px;
  }

  .message-model {
    font-size: 9px;
  }

  .message-time {
    font-size: 10px;
  }

  .role-icon {
    font-size: 14px;
  }

  .message-content {
    font-size: 12px;
    line-height: 1.4;
  }

  .markdown-body {
    font-size: 12px;
  }

  .markdown-body :deep(h1) { font-size: 1.3em; }
  .markdown-body :deep(h2) { font-size: 1.2em; }
  .markdown-body :deep(h3) { font-size: 1.1em; }

  .markdown-body :deep(pre) {
    padding: 6px;
  }

  .markdown-body :deep(pre code) {
    font-size: 10px;
  }

  .markdown-body :deep(table th),
  .markdown-body :deep(table td) {
    padding: 6px 8px;
  }
}

/* 移动端 (< 640px) */
@media (max-width: 640px) {
  .chat-message {
    padding: 6px 10px;
    margin-bottom: 4px;
  }

  .message-header {
    gap: 3px;
    margin-bottom: 4px;
  }

  .message-role {
    font-size: 10px;
  }

  .message-model {
    font-size: 8px;
    padding: 1px 4px;
  }

  .message-time {
    font-size: 9px;
    display: none; /* 在非常小的屏幕隐藏时间 */
  }

  .role-icon {
    font-size: 12px;
  }

  .copy-btn {
    opacity: 1; /* 在移动端始终显示复制按钮 */
  }

  .message-content {
    font-size: 11px;
    line-height: 1.35;
  }

  .markdown-body {
    font-size: 11px;
  }

  .markdown-body :deep(h1) { font-size: 1.2em; }
  .markdown-body :deep(h2) { font-size: 1.1em; }
  .markdown-body :deep(h3) { font-size: 1.05em; }

  .markdown-body :deep(code) {
    padding: 1px 4px;
    font-size: 0.85em;
  }

  .markdown-body :deep(pre) {
    padding: 4px;
    border-radius: 4px;
  }

  .markdown-body :deep(pre code) {
    font-size: 9px;
    line-height: 1.4;
  }

  .markdown-body :deep(ul),
  .markdown-body :deep(ol) {
    padding-left: 14px;
  }

  .markdown-body :deep(table th),
  .markdown-body :deep(table td) {
    padding: 4px 6px;
    font-size: 10px;
  }

  .expand-btn {
    padding: 3px 10px;
    font-size: 11px;
  }

  .image-item {
    padding: 3px 6px;
    font-size: 10px;
  }
}

/* 超小屏幕 (< 480px) */
@media (max-width: 480px) {
  .chat-message {
    padding: 4px 8px;
    margin-bottom: 3px;
  }

  .message-header {
    margin-bottom: 3px;
  }

  .message-role {
    font-size: 9px;
  }

  .message-model {
    font-size: 7px;
  }

  .role-icon {
    font-size: 10px;
  }

  .message-content {
    font-size: 10px;
  }

  .markdown-body {
    font-size: 10px;
  }

  .markdown-body :deep(pre code) {
    font-size: 8px;
  }

  .expand-btn {
    font-size: 10px;
    padding: 2px 8px;
  }
}
</style>
