<template>
  <n-drawer
    v-model:show="visible"
    :width="drawerWidth"
    placement="right"
    :auto-focus="false"
    :trap-focus="false"
    :block-scroll="false"
  >
    <div class="drawer-wrapper">
      <!-- Header -->
      <div class="drawer-header">
        <div class="header-row">
          <n-icon :size="18" :component="ChatbubblesIcon" />
          <span class="session-name">{{ sessionAlias || sessionId.substring(0, 8) }} ({{ totalMessages }})</span>
          <n-tag v-if="metadata.gitBranch" size="small" type="info">
            <template #icon>
              <n-icon :component="GitBranchIcon" />
            </template>
            {{ metadata.gitBranch }}
          </n-tag>
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
                <ChatMessage :key="item.id" :message="item" />
              </div>
            </template>
          </n-virtual-list>
        </div>

        <!-- Scroll to bottom button -->
        <div v-if="showScrollButton" class="scroll-btn" @click="scrollToBottom">
          <n-icon :size="18" :component="ArrowDownIcon" />
        </div>
      </div>
    </div>
  </n-drawer>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { NDrawer, NIcon, NTag, NSpin, NEmpty, NButton, NVirtualList } from 'naive-ui'
import { useResponsiveDrawer } from '../composables/useResponsiveDrawer'
import { Chatbubbles as ChatbubblesIcon, GitBranch as GitBranchIcon, ChevronUp as ChevronUpIcon, ArrowDown as ArrowDownIcon, Close as CloseIcon } from '@vicons/ionicons5'
import ChatMessage from './ChatMessage.vue'
import SessionSummaryCard from './SessionSummaryCard.vue'
import FilterBar from './chat/FilterBar.vue'
import { getSessionMessages } from '../api/sessions'
import { getTrashMessages } from '../api/trash'
import { adaptMessages } from '../utils/messageAdapter'

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

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

// State
const loading = ref(false)
const messages = ref([])
const metadata = ref({})
const currentPage = ref(1)
const totalMessages = ref(0)
const hasMore = ref(false)
const virtualListRef = ref(null)
const showScrollButton = ref(false)
const isAtBottom = ref(true)
const lastScrollTop = ref(0)
const lastScrollDirection = ref('down')
const lastAutoLoadAt = ref(0)
const lastUserScrollAt = ref(0)
const isProgrammaticScroll = ref(false)
const summaryCardRef = ref(null)
const activeFilters = ref(['user', 'assistant', 'tool', 'thinking'])
const allFilters = ['user', 'assistant', 'tool', 'thinking']
const isFiltering = computed(() => activeFilters.value.length < allFilters.length)
const messageCounts = ref({
  user: 0,
  assistant: 0,
  tool: 0,
  thinking: 0
})
const hasStableCounts = ref(false)
const isAutoFilling = ref(false)
const filterNoMatchStreak = ref(0)
const FILTER_FILL_TARGET = 20
const FILTER_MAX_PAGES = 5

const adaptedMessages = computed(() => adaptMessages(messages.value, props.channel))

function buildCounts(items) {
  const counts = {
    user: 0,
    assistant: 0,
    tool: 0,
    thinking: 0
  }
  ;(items || []).forEach((item) => {
    if (counts[item.role] !== undefined) {
      counts[item.role] += 1
    }
  })
  return counts
}

function applyMessageCounts(counts) {
  if (!counts) return
  messageCounts.value = {
    user: 0,
    assistant: 0,
    tool: 0,
    thinking: 0,
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
  return adaptedMessages.value.filter((item) => active.has(item.role))
})

const showLoadMore = computed(() => hasMore.value && !isFiltering.value)

const virtualItems = computed(() => {
  if (!showLoadMore.value) return filteredMessages.value
  return [{ id: 'load-more', __type: 'load-more' }, ...filteredMessages.value]
})

// itemSize 需要尽量接近最小高度，过大容易导致可视区空洞
const estimatedItemSize = 64

// Load messages
async function loadMessages(page = 1) {
  if (loading.value) return

  try {
    loading.value = true
    const response = props.trashId
      ? await getTrashMessages(props.projectName, props.trashId, page, 20, 'desc', props.channel)
      : await getSessionMessages(props.projectName, props.sessionId, page, 20, 'desc', props.channel)

    const { messages: newMessages, metadata: meta, pagination } = response

    if (page === 1) {
      // First load - reverse to show oldest first (newest at bottom)
      messages.value = newMessages.reverse()
      metadata.value = meta
    } else {
      // Load more (prepend older messages) - reverse new messages too
      messages.value = [...newMessages.reverse(), ...messages.value]
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

    // Scroll to bottom on first load
    if (page === 1) {
      nextTick(() => {
        scrollToBottom(false)
      })
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

// Scroll to bottom
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

  // Show scroll button when not at bottom
  const distanceToBottom = scrollHeight - scrollTop - clientHeight
  showScrollButton.value = distanceToBottom > 200
  if (direction !== 'up') {
    isAtBottom.value = distanceToBottom <= 2
  } else if (distanceToBottom > 2) {
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
    if (isAtBottom.value && lastScrollDirection.value !== 'up') {
      scrollToBottom(false)
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

// Expose open method for parent to call
function open() {
  messages.value = []
  metadata.value = {}
  currentPage.value = 1
  totalMessages.value = 0
  hasMore.value = false
  showScrollButton.value = false
  isAutoFilling.value = false
  filterNoMatchStreak.value = 0
  hasStableCounts.value = false
  messageCounts.value = {
    user: 0,
    assistant: 0,
    tool: 0,
    thinking: 0
  }
  activeFilters.value = ['user', 'assistant', 'tool', 'thinking']
  loadMessages(1)
}

watch(isFiltering, (value) => {
  if (value) {
    nextTick(() => {
      ensureFilteredCoverage()
    })
  }
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
</style>
