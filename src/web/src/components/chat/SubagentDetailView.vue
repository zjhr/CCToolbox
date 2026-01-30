<template>
  <div class="subagent-detail">
    <div class="subagent-header">
      <div class="header-row">
        <div class="header-title">子代理信息</div>
        <span class="spacer"></span>
        <n-tag v-if="subagentType" size="small" type="info">{{ subagentType }}</n-tag>
        <n-tag v-if="agentId" size="small" type="success" :title="agentId">ID: {{ agentIdShort }}</n-tag>
      </div>
      <div v-if="promptSummary" class="prompt-summary" :title="prompt">
        <span class="prompt-label">提示词</span>
        <span class="prompt-text">{{ promptSummary }}</span>
      </div>
    </div>

    <div class="subagent-body">
      <!-- 加载状态 -->
      <div v-if="loading && messages.length === 0" class="loading-container">
        <n-spin size="medium">
          <template #description>加载子代理记录...</template>
        </n-spin>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!loading && messages.length === 0" class="empty-container">
        <n-empty description="暂无子代理记录" />
      </div>

      <!-- 消息列表 -->
      <div v-else class="messages-container">
        <FilterBar v-model="activeFilters" :counts="messageCounts" />
        <n-virtual-list
          ref="virtualListRef"
          class="messages-list"
          :items="virtualItems"
          :item-size="estimatedItemSize"
          :item-resizable="true"
          key-field="id"
          :items-style="{ padding: '8px 20px 16px' }"
          :padding-top="8"
          :padding-bottom="8"
          @scroll="handleScroll"
          @resize="handleItemResize"
        >
          <template #default="{ item }">
            <div v-if="item.__type === 'load-more'" class="load-more-top">
              <n-button
                :loading="loading"
                @click="loadMore"
                size="small"
                secondary
              >
                <template #icon>
                  <n-icon :component="ChevronUpIcon" />
                </template>
                加载更早的消息
              </n-button>
            </div>
            <div v-else class="message-item">
              <ChatMessage
                :key="item.id"
                :message="item"
                :progress-entries="progressEntries"
                @click-task="handleTaskClick"
              />
            </div>
          </template>
        </n-virtual-list>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { NSpin, NEmpty, NButton, NVirtualList, NTag, NIcon } from 'naive-ui'
import { ChevronUp as ChevronUpIcon } from '@vicons/ionicons5'
import ChatMessage from '../ChatMessage.vue'
import FilterBar from './FilterBar.vue'
import { getSubagentMessages } from '../../api/sessions'
import { adaptMessages } from '../../utils/messageAdapter'

const props = defineProps({
  projectName: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  agentId: {
    type: String,
    default: ''
  },
  prompt: {
    type: String,
    default: ''
  },
  subagentType: {
    type: String,
    default: ''
  },
  channel: {
    type: String,
    default: 'claude'
  }
})

const emit = defineEmits(['click-task', 'error'])

const loading = ref(false)
const messages = ref([])
const metadata = ref({})
const progressEntries = ref([])
const currentPage = ref(1)
const totalMessages = ref(0)
const hasMore = ref(false)
const virtualListRef = ref(null)
const lastScrollTop = ref(0)
const lastScrollDirection = ref('down')
const lastAutoLoadAt = ref(0)
const lastUserScrollAt = ref(0)
const isProgrammaticScroll = ref(false)
const activeFilters = ref(['user', 'assistant', 'tool', 'thinking', 'subagent'])
const messageCounts = ref({
  user: 0,
  assistant: 0,
  tool: 0,
  thinking: 0,
  subagent: 0
})

const estimatedItemSize = 64
const agentIdShort = computed(() => props.agentId ? props.agentId.substring(0, 8) : '')
const promptSummary = computed(() => truncateText(props.prompt, 2, 140))
const adaptedMessages = computed(() => adaptMessages(messages.value, props.channel))
function isSubagentMessage(item) {
  if (!item || item.role !== 'tool') return false
  const calls = Array.isArray(item.toolCalls) ? item.toolCalls : []
  return calls.some((call) => String(call?.name || '').trim().toLowerCase() === 'task')
}

function getFilterRole(item) {
  if (!item) return 'assistant'
  if (item.role === 'tool' && isSubagentMessage(item)) return 'subagent'
  return item.role || 'assistant'
}

const filteredMessages = computed(() => {
  const active = new Set(activeFilters.value)
  return adaptedMessages.value.filter((item) => active.has(getFilterRole(item)))
})
const showLoadMore = computed(() => hasMore.value)
const virtualItems = computed(() => {
  if (!showLoadMore.value) return filteredMessages.value
  return [{ id: 'load-more', __type: 'load-more' }, ...filteredMessages.value]
})

function buildCounts(items) {
  const counts = {
    user: 0,
    assistant: 0,
    tool: 0,
    thinking: 0,
    subagent: 0
  }
  ;(items || []).forEach((item) => {
    const role = getFilterRole(item)
    if (counts[role] !== undefined) {
      counts[role] += 1
    }
  })
  return counts
}

function applyMessageCounts(counts) {
  if (!counts) return
  const fallbackCounts = buildCounts(adaptedMessages.value)
  messageCounts.value = {
    user: 0,
    assistant: 0,
    tool: 0,
    thinking: 0,
    subagent: 0,
    ...fallbackCounts,
    ...counts
  }
}

function extractResponseCounts(response) {
  if (!response) return null
  return response.messageCounts
    || response.pagination?.messageCounts
    || response.metadata?.messageCounts
    || null
}

async function loadMessages(page = 1) {
  if (loading.value || !props.agentId) return
  if (props.channel !== 'claude') {
    emit('error', '子代理详情仅支持 Claude 渠道')
    return
  }

  try {
    loading.value = true
    const response = await getSubagentMessages(
      props.projectName,
      props.sessionId,
      props.agentId,
      page,
      20,
      'desc',
      props.channel
    )

    const { messages: newMessages, metadata: meta, pagination } = response

    if (page === 1) {
      messages.value = newMessages.reverse()
      metadata.value = meta
      progressEntries.value = Array.isArray(meta?.progress) ? meta.progress : []
    } else {
      messages.value = [...newMessages.reverse(), ...messages.value]
    }

    currentPage.value = pagination.page
    totalMessages.value = pagination.total
    hasMore.value = pagination.hasMore

    const responseCounts = extractResponseCounts(response)
    if (responseCounts) {
      applyMessageCounts(responseCounts)
    } else if (page === 1) {
      applyMessageCounts(buildCounts(adaptedMessages.value))
    }

    if (page === 1) {
      nextTick(() => {
        scrollToBottom(false)
      })
    }
  } catch (err) {
    console.error('Failed to load subagent messages:', err)
    const errorMsg = '加载子代理记录失败: ' + (err.response?.data?.error || err.message)
    emit('error', errorMsg)
  } finally {
    loading.value = false
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return

  const beforeCount = filteredMessages.value.length
  const container = getScrollElement()
  const oldScrollHeight = container?.scrollHeight || 0
  const oldScrollTop = container?.scrollTop || 0

  loadMessages(currentPage.value + 1).then(() => {
    nextTick(() => {
      const afterCount = filteredMessages.value.length
      const delta = afterCount - beforeCount
      if (container) {
        const newScrollHeight = container.scrollHeight
        const heightDelta = newScrollHeight - oldScrollHeight
        if (heightDelta > 0) {
          setProgrammaticScroll(() => {
            container.scrollTop = oldScrollTop + heightDelta
          })
          return
        }
      }
      const list = virtualListRef.value
      if (delta > 0 && list?.scrollTo) {
        setProgrammaticScroll(() => {
          list.scrollTo({ index: delta + 1, behavior: 'auto', debounce: false })
        })
      }
    })
  })
}

function handleScroll(e) {
  const target = e.target
  if (!target) return

  const { scrollTop, scrollHeight, clientHeight } = target
  const direction = scrollTop > lastScrollTop.value ? 'down' : scrollTop < lastScrollTop.value ? 'up' : lastScrollDirection.value
  lastScrollTop.value = scrollTop
  lastScrollDirection.value = direction
  if (!isProgrammaticScroll.value) {
    lastUserScrollAt.value = Date.now()
  }

  const distanceToBottom = scrollHeight - scrollTop - clientHeight
  const now = Date.now()
  const canAutoLoad = hasMore.value && !loading.value
  const nearTop = scrollTop <= 12

  if (canAutoLoad && nearTop) {
    if (now - lastAutoLoadAt.value < 400) return
    lastAutoLoadAt.value = now
    loadMore()
    requestAnimationFrame(() => {
      if (target.scrollHeight === scrollHeight && target.scrollTop === scrollTop && hasMore.value) {
        loadMore()
      }
    })
    return
  }

  if (distanceToBottom < 0) return
  if (scrollTop < 160 && canAutoLoad && direction === 'up') {
    if (now - lastUserScrollAt.value > 180) return
    if (now - lastAutoLoadAt.value < 400) return
    lastAutoLoadAt.value = now
    loadMore()
  }
}

function handleItemResize() {
  nextTick(() => {
    const list = virtualListRef.value
    if (list?.scrollTo && filteredMessages.value.length > 0) {
      if (lastScrollDirection.value !== 'up') {
        scrollToBottom(false)
      }
    }
  })
}

function getScrollElement() {
  const list = virtualListRef.value
  if (!list) return null
  return list.$el || list
}

function setProgrammaticScroll(action) {
  isProgrammaticScroll.value = true
  action()
  requestAnimationFrame(() => {
    isProgrammaticScroll.value = false
  })
}

function scrollToBottom(smooth = true) {
  nextTick(() => {
    const list = virtualListRef.value
    if (list?.scrollTo && virtualItems.value.length > 0) {
      setProgrammaticScroll(() => {
        list.scrollTo({ position: 'bottom', behavior: smooth ? 'smooth' : 'auto' })
      })
      return
    }
    const container = getScrollElement()
    if (!container) return
    setProgrammaticScroll(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      })
    })
  })
}

function truncateText(text, maxLines = 2, maxChars = 140) {
  if (!text) return ''
  const lines = text.split('\n')
  if (lines.length > maxLines) {
    return `${lines.slice(0, maxLines).join('\n')}...`
  }
  if (text.length > maxChars) {
    return text.substring(0, maxChars) + '...'
  }
  return text
}

function resetView() {
  messages.value = []
  metadata.value = {}
  progressEntries.value = []
  currentPage.value = 1
  totalMessages.value = 0
  hasMore.value = false
  lastScrollTop.value = 0
  lastScrollDirection.value = 'down'
  lastAutoLoadAt.value = 0
  lastUserScrollAt.value = 0
  activeFilters.value = ['user', 'assistant', 'tool', 'thinking', 'subagent']
  messageCounts.value = {
    user: 0,
    assistant: 0,
    tool: 0,
    thinking: 0,
    subagent: 0
  }
  loadMessages(1)
}

function handleTaskClick(payload) {
  emit('click-task', payload)
}

watch(
  () => [props.projectName, props.sessionId, props.agentId],
  () => {
    if (!props.agentId) return
    resetView()
  },
  { immediate: true }
)
</script>

<style scoped>
.subagent-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.subagent-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--n-border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--n-text-color);
}

.prompt-summary {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--n-text-color-2);
}

.prompt-label {
  font-weight: 600;
  color: var(--n-text-color-3);
}

.prompt-text {
  flex: 1;
  white-space: pre-line;
  word-break: break-word;
}

.subagent-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.loading-container,
.empty-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.messages-container {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages-list {
  flex: 1;
  height: 100%;
}

.load-more-top {
  display: flex;
  justify-content: center;
  padding: 0 0 16px 0;
}

.message-item {
  padding-bottom: 12px;
}

.spacer {
  flex: 1;
}
</style>
