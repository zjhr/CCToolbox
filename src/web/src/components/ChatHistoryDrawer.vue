<template>
  <div>
    <n-drawer
      v-model:show="visible"
      :width="drawerWidth"
      placement="right"
      :auto-focus="false"
      :trap-focus="false"
      :block-scroll="false"
      :z-index="1100"
    >
      <div class="drawer-wrapper">
        <!-- Header -->
        <div class="drawer-header">
          <div class="header-row">
            <n-icon :size="18" :component="ChatbubblesIcon" />
            <span class="session-name">{{ sessionAlias || sessionId.substring(0, 8) }} ({{ totalMessages }})</span>
            <n-tag :type="channelTagType" size="small" round style="text-transform: capitalize">
              {{ props.channel }}
            </n-tag>
            <n-tag v-if="metadata.gitBranch" size="small" type="info">
              <template #icon>
                <n-icon :component="GitBranchIcon" />
              </template>
              {{ metadata.gitBranch }}
            </n-tag>
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button
                  text
                  size="small"
                  class="copy-path-btn"
                  :class="{ 'is-copied': copySuccess }"
                  @click="handleCopyFilePath"
                >
                  <template #icon>
                    <n-icon :component="ClipboardOutlineIcon" />
                  </template>
                </n-button>
              </template>
              {{ copyTooltipText }}
            </n-tooltip>
            <span class="spacer"></span>
            <n-icon
              :size="20"
              :component="CloseIcon"
              class="close-btn"
              @click="visible = false"
            />
          </div>
          <div v-if="metadata.summary" class="session-summary">{{ metadata.summary }}</div>
        </div>

        <!-- Body -->
        <div class="drawer-body">
          <!-- Session Summary -->
          <div v-if="!trashId && sessionId" class="summary-container">
            <SessionSummaryCard
              ref="summaryCardRef"
              :project-name="projectName"
              :session-id="sessionId"
            />
          </div>

          <div v-if="showRealtimeDisconnectedHint" class="realtime-disconnected-hint">
            实时更新已暂停，请手动刷新查看最新消息
          </div>

          <!-- Loading state -->
          <div v-if="loading && messages.length === 0" class="loading-container">
            <n-spin size="medium">
              <template #description>加载聊天记录...</template>
            </n-spin>
          </div>

          <!-- Empty state -->
          <div v-else-if="!loading && messages.length === 0" class="empty-container">
            <n-empty description="暂无聊天记录" />
          </div>

          <!-- Messages list -->
          <div v-else class="messages-container">
            <FilterBar
              v-model="activeFilters"
              :counts="messageCounts"
              :search-keyword="searchKeyword"
              :search-matches-count="searchMatches.length"
              :search-current-index="currentSearchIndex"
              :loading-search="loadingSearch"
              @update:search-keyword="searchKeyword = $event"
              @search="onSearch"
              @next="onNextMatch"
              @prev="onPrevMatch"
              @clear="onClearSearch"
            />
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
                <div v-else class="message-item" :data-message-id="item.id">
                  <ChatMessage
                    :key="item.id"
                    :message="item"
                    :progress-entries="progressEntries"
                    :keyword="searchKeyword"
                    @click-task="handleTaskClick"
                  />
                </div>
              </template>
            </n-virtual-list>
          </div>

          <!-- Scroll buttons -->
          <div v-if="showScrollTopButton" class="scroll-btn scroll-top-btn" @click="scrollToTop">
            <n-icon :size="18" :component="ArrowUpOutline" />
          </div>
          <div v-if="showScrollButton" class="scroll-btn" @click="scrollToBottom">
            <n-icon :size="18" :component="ArrowDownIcon" />
          </div>
        </div>
      </div>
    </n-drawer>

    <n-drawer
      v-model:show="subagentVisible"
      :width="drawerWidth"
      placement="right"
      :auto-focus="false"
      :trap-focus="false"
      :block-scroll="false"
      :z-index="1200"
    >
      <div class="drawer-wrapper">
        <div class="drawer-header">
          <div class="header-row">
            <n-button text size="small" class="back-btn" @click="handleSubagentBack">
              <template #icon>
                <n-icon :component="ArrowBackOutline" />
              </template>
              返回
            </n-button>
            <span class="session-name">子代理详情</span>
            <span class="spacer"></span>
            <n-icon
              :size="20"
              :component="CloseIcon"
              class="close-btn"
              @click="closeSubagentDrawer"
            />
          </div>
        </div>
        <div class="drawer-body">
          <SubagentDetailView
            v-if="currentSubagent"
            :project-name="projectName"
            :session-id="sessionId"
            :agent-id="currentSubagent.agentId"
            :prompt="currentSubagent.prompt"
            :subagent-type="currentSubagent.subagentType"
            :channel="channel"
            @click-task="handleSubagentTaskClick"
            @error="(msg) => emit('error', msg)"
          />
        </div>
      </div>
    </n-drawer>
  </div>
</template>
<script setup>
import { ref, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { NDrawer, NIcon, NTag, NSpin, NEmpty, NButton, NVirtualList, NTooltip } from 'naive-ui'
import { useResponsiveDrawer } from '../composables/useResponsiveDrawer'
import { useSessionRealtime } from '../composables/useSessionRealtime'
import { Chatbubbles as ChatbubblesIcon, GitBranch as GitBranchIcon, ChevronUp as ChevronUpIcon, ArrowDown as ArrowDownIcon, ArrowUpOutline, Close as CloseIcon, ArrowBackOutline, ClipboardOutline as ClipboardOutlineIcon } from '@vicons/ionicons5'
import ChatMessage from './ChatMessage.vue'
import SessionSummaryCard from './SessionSummaryCard.vue'
import FilterBar from './chat/FilterBar.vue'
import SubagentDetailView from './chat/SubagentDetailView.vue'
import { getSessionMessages, searchSessionMessages } from '../api/sessions'
import { getTrashMessages } from '../api/trash'
import { adaptMessages } from '../utils/messageAdapter'
import message from '../utils/message'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  projectName: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  sessionAlias: {
    type: String,
    default: ''
  },
  filePath: {
    type: String,
    default: ''
  },
  trashId: {
    type: String,
    default: ''
  },
  channel: {
    type: String,
    default: 'claude'
  }
})

const emit = defineEmits(['update:show', 'error'])

const { drawerWidth } = useResponsiveDrawer(900, 800)

const channelTagType = computed(() => {
  const channel = (props.channel || '').toLowerCase()
  if (channel.includes('claude')) return 'success'
  if (channel.includes('codex')) return 'info'
  if (channel.includes('gemini')) return 'warning'
  return 'default'
})

const realtimeWatchActive = ref(false)
const hadRealtimeConnected = ref(false)

const { startWatch, stopWatch, isConnected: realtimeConnected } = useSessionRealtime({
  onUpdate: (newMessages) => {
    if (!newMessages || newMessages.length === 0) return
    // 同步到组件内的 messages，并保持去重（虽然 composable 内部已经去重了，这里为了保险再做一次）
    const existingIds = new Set(messages.value.map(m => m.id))
    const uniqueOnes = newMessages.filter(m => !existingIds.has(m.id))
    
    if (uniqueOnes.length > 0) {
      messages.value.push(...uniqueOnes)
      // 实时追加新消息时，如果用户在底部，则自动跟进
      if (isAtBottom.value) {
        nextTick(() => {
          scrollToBottomImmediate()
        })
      }
    }
  }
})

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})
const copySuccess = ref(false)
const copyTooltipText = computed(() => (copySuccess.value ? '已复制' : '复制文件路径'))
const filePathToCopy = computed(() => {
  const value = (props.filePath || '').trim()
  return value || props.sessionId || ''
})

let copySuccessTimer = null

function resetCopyState() {
  copySuccess.value = false
  if (copySuccessTimer) {
    clearTimeout(copySuccessTimer)
    copySuccessTimer = null
  }
}

async function handleCopyFilePath() {
  const textToCopy = filePathToCopy.value
  if (!textToCopy) {
    message.warning('未找到可复制内容')
    return
  }

  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error('当前环境不支持剪贴板写入')
    }
    await navigator.clipboard.writeText(textToCopy)
    copySuccess.value = true
    message.success('已复制')
    if (copySuccessTimer) clearTimeout(copySuccessTimer)
    copySuccessTimer = setTimeout(() => {
      copySuccess.value = false
      copySuccessTimer = null
    }, 1500)
  } catch (err) {
    message.error('复制失败: ' + (err?.message || '未知错误'))
  }
}

// State
const loading = ref(false)
const messages = ref([])
const metadata = ref({})
const progressEntries = ref([])
const currentPage = ref(1)
const totalMessages = ref(0)
const hasMore = ref(false)
const scrollTarget = ref('bottom') // 'top' or 'bottom' — controls auto-scroll direction on load
const virtualListRef = ref(null)
const showScrollButton = ref(false)
const showScrollTopButton = ref(false)
const isAtBottom = ref(true)
const isAtTop = ref(true)
const lastScrollTop = ref(0)
const lastScrollDirection = ref('down')
const lastAutoLoadAt = ref(0)
const lastUserScrollAt = ref(0)
const isProgrammaticScroll = ref(false)
const summaryCardRef = ref(null)
const activeFilters = ref(['user', 'assistant', 'tool', 'thinking', 'subagent'])
const allFilters = ['user', 'assistant', 'tool', 'thinking', 'subagent']
const isFiltering = computed(() => activeFilters.value.length < allFilters.length)
const searchKeyword = ref('')
const searchMatches = ref([])
const currentSearchIndex = ref(0)
const loadingSearch = ref(false)
const activeSearchMessageId = ref('')
const messageCounts = ref({
  user: 0,
  assistant: 0,
  tool: 0,
  thinking: 0,
  subagent: 0
})
const hasStableCounts = ref(false)
const isAutoFilling = ref(false)
const filterNoMatchStreak = ref(0)
const FILTER_FILL_TARGET = 20
const FILTER_MAX_PAGES = 5
const SEARCH_SCROLL_MAX_RETRIES = 5
const SEARCH_SCROLL_RETRY_DELAY_MS = 100
const SEARCH_ALIGN_MAX_RETRIES = 6
const SEARCH_ALIGN_RETRY_DELAY_MS = 32
const MAX_SUBAGENT_STACK = 10
const subagentVisible = ref(false)
const subagentStack = ref([])
const BOTTOM_AUTO_SCROLL_THRESHOLD = 100

const adaptedMessages = computed(() => adaptMessages(messages.value, props.channel))

// Add originalIndex to adapted messages for search scrolling
// originalIndex represents the message's position in the full JSONL file
// One raw message can produce multiple adapted items (e.g., thinking + response)
// All items from the same raw message should share the same originalIndex
const adaptedWithIndex = computed(() => {
  const total = totalMessages.value
  const loaded = messages.value.length
  // In desc mode (default), we load most recent N messages, reverse them
  // So messages[0] corresponds to JSONL index (total - loaded)
  const offset = hasMore.value ? total - loaded : 0

  const result = []
  // Process each raw message and track which adapted items came from it
  messages.value.forEach((rawMsg, rawIndex) => {
    // Adapt this single raw message to see how many items it produces
    const singleAdapted = adaptMessages([rawMsg], props.channel)
    const originalIndex = offset + rawIndex
    // All items from this raw message get the same originalIndex
    singleAdapted.forEach((item) => {
      result.push({
        ...item,
        originalIndex
      })
    })
  })

  return result
})

const currentSubagent = computed(() => subagentStack.value[subagentStack.value.length - 1] || null)
const showRealtimeDisconnectedHint = computed(() => {
  return !props.trashId
    && realtimeWatchActive.value
    && hadRealtimeConnected.value
    && !realtimeConnected.value
})

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
  hasStableCounts.value = true
}

function extractResponseCounts(response) {
  if (!response) return null
  return response.messageCounts
    || response.pagination?.messageCounts
    || response.metadata?.messageCounts
    || null
}

const filteredMessages = computed(() => {
  const active = new Set(activeFilters.value)
  return adaptedWithIndex.value.filter((item) => active.has(getFilterRole(item)))
})

const showLoadMore = computed(() => hasMore.value && !isFiltering.value)

const virtualItems = computed(() => {
  if (!showLoadMore.value) return filteredMessages.value
  return [{ id: 'load-more', __type: 'load-more' }, ...filteredMessages.value]
})

// itemSize 需要尽量接近最小高度，过大容易导致可视区空洞
const estimatedItemSize = 64

// Load messages
async function loadMessages(page = 1, options = {}) {
  if (loading.value) return

  const { order = 'desc', limit = 20 } = options

  try {
    loading.value = true
    const response = props.trashId
      ? await getTrashMessages(props.projectName, props.trashId, page, limit, order, props.channel)
      : await getSessionMessages(props.projectName, props.sessionId, page, limit, order, props.channel)

    const { messages: newMessages, metadata: meta, pagination } = response

    if (order === 'asc') {
      // asc 模式：消息已按时间正序排列（最早在前），无需 reverse
      if (page === 1) {
        messages.value = newMessages
        metadata.value = meta
        progressEntries.value = Array.isArray(meta?.progress) ? meta.progress : []
      } else {
        // Load more (append newer messages)
        messages.value = [...messages.value, ...newMessages]
      }
    } else {
      // desc 模式（默认）：API 返回最新→最旧，reverse 后变成最旧→最新
      if (page === 1) {
        // First load - reverse to show oldest first (newest at bottom)
        messages.value = newMessages.reverse()
        metadata.value = meta
        progressEntries.value = Array.isArray(meta?.progress) ? meta.progress : []
      } else {
        // Load more (prepend older messages) - reverse new messages too
        messages.value = [...newMessages.reverse(), ...messages.value]
      }
    }

    currentPage.value = pagination.page
    totalMessages.value = pagination.total
    hasMore.value = pagination.hasMore

    const responseCounts = extractResponseCounts(response)
    if (responseCounts) {
      applyMessageCounts(responseCounts)
    } else if (!hasStableCounts.value && page === 1) {
      applyMessageCounts(buildCounts(adaptedMessages.value))
    }

    // Auto-scroll on first load
    if (page === 1) {
      if (scrollTarget.value === 'top') {
        // scrollToTop: many items need real render time, use setTimeout
        setTimeout(() => {
          const list = virtualListRef.value
          if (list?.scrollTo && virtualItems.value.length > 0) {
            setProgrammaticScroll(() => {
              list.scrollTo({ index: 0, behavior: 'auto', debounce: false })
            })
          }
        }, 300)
      } else {
        // scrollToBottom: give Drawer transition + virtual list time to render
        setTimeout(() => {
          scrollToBottomImmediate(false)
        }, 150)
      }
    }
  } catch (err) {
    console.error('Failed to load messages:', err)
    const errorMsg = '加载聊天记录失败: ' + (err.response?.data?.error || err.message)
    emit('error', errorMsg)
  } finally {
    loading.value = false
    ensureFilteredCoverage()
  }
}

function openSubagentDrawer(payload) {
  if (!payload || !payload.agentId) return
  subagentStack.value = [{
    agentId: payload.agentId,
    prompt: payload.prompt || '',
    subagentType: payload.subagentType || ''
  }]
  subagentVisible.value = true
}

function pushSubagentStack(payload) {
  if (!payload || !payload.agentId) return
  if (subagentStack.value.length >= MAX_SUBAGENT_STACK) {
    emit('error', '子代理嵌套层级过深，无法继续打开详情')
    return
  }
  subagentStack.value.push({
    agentId: payload.agentId,
    prompt: payload.prompt || '',
    subagentType: payload.subagentType || ''
  })
}

function handleTaskClick(payload) {
  openSubagentDrawer(payload)
}

function handleSubagentTaskClick(payload) {
  pushSubagentStack(payload)
}

function handleSubagentBack() {
  if (subagentStack.value.length > 1) {
    subagentStack.value.pop()
    return
  }
  closeSubagentDrawer()
}

function closeSubagentDrawer() {
  subagentVisible.value = false
  subagentStack.value = []
}

async function ensureFilteredCoverage() {
  if (!isFiltering.value || !hasMore.value || loading.value || isAutoFilling.value) return
  const container = getScrollElement()
  const hasScrollableSpace = container ? container.scrollHeight > container.clientHeight + 40 : false
  if (filteredMessages.value.length >= FILTER_FILL_TARGET && hasScrollableSpace) return
  isAutoFilling.value = true
  let rounds = 0
  while (isFiltering.value && hasMore.value && rounds < FILTER_MAX_PAGES) {
    const containerNow = getScrollElement()
    const hasSpaceNow = containerNow ? containerNow.scrollHeight > containerNow.clientHeight + 40 : false
    if (filteredMessages.value.length >= FILTER_FILL_TARGET && hasSpaceNow) break
    await loadMessages(currentPage.value + 1)
    rounds += 1
  }
  isAutoFilling.value = false
}

// Load more messages
function loadMore() {
  if (!hasMore.value || loading.value) return

  const beforeCount = filteredMessages.value.length
  const container = getScrollElement()
  const oldScrollHeight = container?.scrollHeight || 0
  const oldScrollTop = container?.scrollTop || 0

  loadMessages(currentPage.value + 1).then(() => {
    nextTick(() => {
      const list = virtualListRef.value
      const afterCount = filteredMessages.value.length
      const delta = afterCount - beforeCount
      if (isFiltering.value && delta === 0) {
        filterNoMatchStreak.value += 1
      } else {
        filterNoMatchStreak.value = 0
      }
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
      if (delta > 0 && list?.scrollTo) {
        setProgrammaticScroll(() => {
          list.scrollTo({ index: delta + 1, behavior: 'auto', debounce: false })
        })
        return
      }
    })
  })
}

// Scroll to top — load all messages in asc order and scroll to the top (earliest messages)
async function scrollToTop() {
  scrollTarget.value = 'top'
  messages.value = []
  currentPage.value = 1
  hasMore.value = false
  showScrollButton.value = false
  showScrollTopButton.value = false
  isAtTop.value = true

  await loadMessages(1, { order: 'asc', limit: 99999 })
}

// Virtual list scroll to bottom (internal use)
function scrollToBottomImmediate(smooth = true) {
  nextTick(() => {
    const list = virtualListRef.value
    if (list?.scrollTo && virtualItems.value.length > 0) {
      const lastIndex = virtualItems.value.length - 1
      setProgrammaticScroll(() => {
        list.scrollTo({ index: lastIndex, behavior: smooth ? 'smooth' : 'auto' })
        // 增加一个短延迟兜底，防止高度测量延迟导致的置底不完全
        setTimeout(() => {
          if (virtualListRef.value) {
            virtualListRef.value.scrollTo({ index: lastIndex, behavior: smooth ? 'smooth' : 'auto' })
          }
        }, 64)
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

// Scroll to bottom — reset and reload from the last message
async function scrollToBottom() {
  scrollTarget.value = 'bottom'
  messages.value = []
  currentPage.value = 1
  hasMore.value = false
  showScrollButton.value = false
  showScrollTopButton.value = false
  isAtBottom.value = true

  await loadMessages(1)
}

function generateSummary() {
  summaryCardRef.value?.summarize?.()
}

// Handle scroll
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

  // Show scroll buttons
  const distanceToBottom = scrollHeight - scrollTop - clientHeight
  showScrollButton.value = distanceToBottom > 200
  showScrollTopButton.value = scrollTop > 200

  // Update position status
  isAtTop.value = scrollTop <= 12
  if (direction !== 'up') {
    isAtBottom.value = distanceToBottom <= BOTTOM_AUTO_SCROLL_THRESHOLD
  } else if (distanceToBottom > BOTTOM_AUTO_SCROLL_THRESHOLD) {
    isAtBottom.value = false
  }

  // Auto load more when scrolling near top
  const now = Date.now()
  const throttle = isFiltering.value
    ? (filterNoMatchStreak.value > 0 ? 1200 : 600)
    : 300
  const canAutoLoad = hasMore.value && !loading.value && !isAutoFilling.value
  const nearTop = scrollTop <= 12

  if (canAutoLoad && nearTop) {
    if (now - lastAutoLoadAt.value < throttle) return
    const beforeHeight = target.scrollHeight
    const beforeTop = target.scrollTop
    lastAutoLoadAt.value = now
    loadMore()
    requestAnimationFrame(() => {
      if (target.scrollHeight === beforeHeight && target.scrollTop === beforeTop && hasMore.value) {
        loadMore()
      }
    })
    return
  }

  if (scrollTop < 160 && canAutoLoad && direction === 'up') {
    if (now - lastUserScrollAt.value > 180) return
    if (now - lastAutoLoadAt.value < throttle) return
    lastAutoLoadAt.value = now
    loadMore()
  }
}

function handleItemResize() {
  nextTick(() => {
    // 搜索定位后，展开/收起导致高度变化时优先重对齐命中项
    if (activeSearchMessageId.value) {
      alignRenderedMatchItem(activeSearchMessageId.value)
      return
    }
    if (isAtBottom.value && lastScrollDirection.value !== 'up') {
      scrollToBottomImmediate(false)
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

function alignRenderedMatchItem(messageId, retryCount = 0) {
  if (!messageId) return
  const container = getScrollElement()
  if (!container || typeof container.querySelectorAll !== 'function') return

  const candidates = container.querySelectorAll('.message-item[data-message-id]')
  let targetElement = null
  for (const candidate of candidates) {
    if (candidate.dataset.messageId === String(messageId)) {
      targetElement = candidate
      break
    }
  }

  if (!targetElement) {
    if (retryCount < SEARCH_ALIGN_MAX_RETRIES) {
      setTimeout(() => {
        alignRenderedMatchItem(messageId, retryCount + 1)
      }, SEARCH_ALIGN_RETRY_DELAY_MS)
    }
    return
  }

  const containerRect = container.getBoundingClientRect?.()
  const targetRect = targetElement.getBoundingClientRect?.()
  if (!containerRect || !targetRect) return

  const topOffset = targetRect.top - containerRect.top - 12
  if (Math.abs(topOffset) <= 2) return

  setProgrammaticScroll(() => {
    container.scrollTo({
      top: Math.max(0, container.scrollTop + topOffset),
      behavior: 'auto'
    })
  })

  // 虚拟列表高度在展开/收起后可能二次变化，继续纠偏直到稳定
  if (retryCount < SEARCH_ALIGN_MAX_RETRIES) {
    setTimeout(() => {
      alignRenderedMatchItem(messageId, retryCount + 1)
    }, SEARCH_ALIGN_RETRY_DELAY_MS)
  }
}

// Search functions
async function onSearch() {
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    onClearSearch()
    return
  }

  loadingSearch.value = true
  try {
    const response = await searchSessionMessages(
      props.projectName,
      props.sessionId,
      keyword,
      20,
      props.channel
    )
    searchMatches.value = response.matches || []
    currentSearchIndex.value = 0

    if (searchMatches.value.length > 0) {
      scrollToMatch(0)
    } else {
      activeSearchMessageId.value = ''
    }
  } catch (err) {
    console.error('Search failed:', err)
    emit('error', '搜索失败: ' + (err.response?.data?.error || err.message))
    searchMatches.value = []
    activeSearchMessageId.value = ''
  } finally {
    loadingSearch.value = false
  }
}

function onNextMatch() {
  if (searchMatches.value.length === 0) return
  const nextIndex = (currentSearchIndex.value + 1) % searchMatches.value.length
  currentSearchIndex.value = nextIndex
  scrollToMatch(nextIndex)
}

function onPrevMatch() {
  if (searchMatches.value.length === 0) return
  const prevIndex = currentSearchIndex.value === 0
    ? searchMatches.value.length - 1
    : currentSearchIndex.value - 1
  currentSearchIndex.value = prevIndex
  scrollToMatch(prevIndex)
}

function onClearSearch() {
  searchKeyword.value = ''
  searchMatches.value = []
  currentSearchIndex.value = 0
  activeSearchMessageId.value = ''
}

function scrollToMatch(matchIndex, retryCount = 0) {
  const match = searchMatches.value[matchIndex]
  if (!match) {
    activeSearchMessageId.value = ''
    return
  }
  currentSearchIndex.value = matchIndex

  const messageIndex = Number(match.messageIndex)
  const matchRole = match.role
  if (!Number.isFinite(messageIndex)) return

  // Find items with matching originalIndex
  // originalIndex is the backend's position in the JSONL file
  const keyword = searchKeyword.value.toLowerCase()

  // First, collect all items with the matching originalIndex
  const virtualIndexMap = new Map()
  virtualItems.value.forEach((item, index) => {
    if (item?.id) {
      virtualIndexMap.set(String(item.id), index)
    }
  })
  const matchingItems = []
  filteredMessages.value.forEach((item) => {
    if (item.originalIndex === messageIndex) {
      const virtualIndex = virtualIndexMap.get(String(item.id))
      if (Number.isFinite(virtualIndex)) {
        matchingItems.push({ item, virtualIndex })
      }
    }
  })

  if (matchingItems.length === 0) {
    activeSearchMessageId.value = ''
    // 虚拟列表尚未渲染到目标消息时，尝试加载更早消息后重试定位
    if (hasMore.value && retryCount < SEARCH_SCROLL_MAX_RETRIES) {
      loadMore()
      setTimeout(() => {
        scrollToMatch(matchIndex, retryCount + 1)
      }, SEARCH_SCROLL_RETRY_DELAY_MS)
    }
    return
  }

  // Strategy: find the best matching item
  // 1. First try to find an item containing the keyword text
  // 2. If no keyword match, try role matching
  // 3. If no role match, use the first item with this originalIndex

  let bestMatch = null

  // Try keyword content match first
  if (keyword) {
    bestMatch = matchingItems.find(({ item }) => {
      const content = getItemTextContent(item)
      return content && content.toLowerCase().includes(keyword)
    })
  }

  // Fall back to role matching
  if (!bestMatch) {
    bestMatch = matchingItems.find(({ item }) => {
      return item.role === matchRole || getFilterRole(item) === matchRole
    })
  }

  // Fall back to first item with matching originalIndex
  if (!bestMatch) {
    bestMatch = matchingItems[0]
  }

  if (bestMatch && virtualListRef.value?.scrollTo) {
    activeSearchMessageId.value = String(bestMatch.item?.id || '')
    setProgrammaticScroll(() => {
      virtualListRef.value.scrollTo({ index: bestMatch.virtualIndex, behavior: 'auto', debounce: false })
    })
    requestAnimationFrame(() => {
      alignRenderedMatchItem(bestMatch.item?.id)
    })
  } else {
    activeSearchMessageId.value = ''
  }
}

// Helper function to extract text content from an adapted message item
function getItemTextContent(item) {
  if (!item) return ''
  // Handle string content
  if (typeof item.content === 'string') return item.content
  // Handle array content (e.g., structured content blocks)
  if (Array.isArray(item.content)) {
    return item.content
      .map(block => {
        if (typeof block === 'string') return block
        if (block?.text) return block.text
        return ''
      })
      .join(' ')
  }
  // Handle tool calls with output
  if (item.toolCalls && Array.isArray(item.toolCalls)) {
    return item.toolCalls
      .map(call => {
        const parts = []
        if (call?.name) parts.push(call.name)
        if (call?.input) parts.push(JSON.stringify(call.input))
        if (call?.output) parts.push(JSON.stringify(call.output))
        return parts.join(' ')
      })
      .join(' ')
  }
  return ''
}

// Expose open method for parent to call
function open() {
  resetCopyState()
  messages.value = []
  metadata.value = {}
  progressEntries.value = []
  currentPage.value = 1
  totalMessages.value = 0
  hasMore.value = false
  showScrollButton.value = false
  showScrollTopButton.value = false
  scrollTarget.value = 'bottom'
  isAtBottom.value = true // 开启时默认在底部
  isAtTop.value = true
  isAutoFilling.value = false
  filterNoMatchStreak.value = 0
  hasStableCounts.value = false
  messageCounts.value = {
    user: 0,
    assistant: 0,
    tool: 0,
    thinking: 0,
    subagent: 0
  }
  activeFilters.value = ['user', 'assistant', 'tool', 'thinking', 'subagent']
  // Reset search state
  searchKeyword.value = ''
  searchMatches.value = []
  currentSearchIndex.value = 0
  loadingSearch.value = false
  activeSearchMessageId.value = ''
  closeSubagentDrawer()
  
  // 开启实时监听 (仅非回收站 session)
  if (!props.trashId && props.sessionId) {
    realtimeWatchActive.value = true
    hadRealtimeConnected.value = false
    startWatch(props.sessionId, props.projectName, props.channel)
  }
  
  loadMessages(1)
}

watch(isFiltering, (value) => {
  if (value) {
    nextTick(() => {
      ensureFilteredCoverage()
    })
  }
})

watch(
  () => visible.value,
  (value) => {
    if (!value) {
      realtimeWatchActive.value = false
      hadRealtimeConnected.value = false
      stopWatch()
      closeSubagentDrawer()
    }
  }
)

watch(
  () => props.sessionId,
  (newId) => {
    resetCopyState()
    if (visible.value && newId && !props.trashId) {
      realtimeWatchActive.value = true
      hadRealtimeConnected.value = false
      startWatch(newId, props.projectName, props.channel)
    }
  }
)

watch(realtimeConnected, (value) => {
  if (value) {
    hadRealtimeConnected.value = true
  }
})

onBeforeUnmount(() => {
  resetCopyState()
})

defineExpose({
  generateSummary,
  open
})
</script>

<style scoped>
.drawer-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--n-color);
}

.drawer-header {
  flex-shrink: 0;
  padding: 16px 20px;
  border-bottom: 1px solid var(--n-border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color);
}

.back-btn {
  display: inline-flex;
  align-items: center;
  color: var(--n-text-color);
}

.copy-path-btn {
  color: var(--n-text-color-3);
  transition: color 0.2s ease;
}

.copy-path-btn:hover {
  color: var(--n-text-color);
}

.copy-path-btn.is-copied {
  color: var(--n-success-color);
}

.spacer {
  flex: 1;
}

.close-btn {
  cursor: pointer;
  color: var(--n-text-color-3);
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--n-text-color);
}

.session-summary {
  font-size: 13px;
  color: var(--n-text-color-2);
  line-height: 1.4;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

.summary-container {
  flex-shrink: 0;
  padding: 12px 20px 0;
}

.realtime-disconnected-hint {
  margin: 12px 20px 0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: #d46b08;
  background: rgba(250, 173, 20, 0.14);
  border: 1px solid rgba(250, 173, 20, 0.35);
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

.load-more-top {
  display: flex;
  justify-content: center;
  padding: 0 0 16px 0;
}

.messages-list {
  flex: 1;
  height: 100%;
}

.message-item {
  padding-bottom: 8px;
}

.scroll-btn {
  position: absolute;
  right: 20px;
  bottom: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--n-color);
  border: 1px solid var(--n-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
  z-index: 10;
}

.scroll-btn:hover {
  background: var(--n-color-hover);
  transform: scale(1.05);
}

.scroll-top-btn {
  bottom: 66px;
}
</style>
