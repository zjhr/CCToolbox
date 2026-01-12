<template>
  <div class="session-list-container">
      <!-- Fixed Header -->
      <div class="header">
      <div class="title-bar">
        <n-button size="small" @click="goBack" class="back-button">
          <template #icon>
            <n-icon size="18"><ArrowBackOutline /></n-icon>
          </template>
        </n-button>

        <div class="title-section">
          <div class="title-with-count">
            <n-h2>{{ projectDisplayName }}</n-h2>
            <n-text depth="3" class="session-count">({{ store.sessions.length }} 个对话)</n-text>
            <n-tag size="small" :bordered="false" type="info" class="total-size-tag">
              {{ formatSize(store.totalSize) }}
            </n-tag>
          </div>
          <n-text depth="3" class="project-path">{{ displayProjectPath }}</n-text>
        </div>

        <div class="header-controls">
          <!-- Search Bar -->
          <div class="search-bar">
            <n-input
              v-model:value="searchQuery"
              placeholder="搜索会话..."
              clearable
              class="search-input"
              @keyup.enter="handleSearch"
              :disabled="searching"
            >
              <template #prefix>
                <n-icon><SearchOutline /></n-icon>
              </template>
              <template #suffix>
                <n-button text @click="handleSearch" :disabled="!searchQuery || searching" :loading="searching">
                  搜索
                </n-button>
              </template>
            </n-input>

            <n-select
              v-model:value="selectedTags"
              multiple
              clearable
              placeholder="标签筛选"
              class="tag-filter-select"
              :options="tagFilterOptions"
              :max-tag-count="1"
              :max-tag-placeholder="formatSelectedTags"
              :disabled="tagFilterOptions.length === 0"
            />
          </div>

          <!-- Search Actions -->
          <div class="search-actions">
            <n-tooltip :disabled="hasOpenSpec">
              <template #trigger>
                <span class="openspec-button-wrapper">
                  <n-button size="small" secondary :disabled="!hasOpenSpec" @click="handleOpenSpec">
                    <template #icon>
                      <n-icon><DocumentTextOutline /></n-icon>
                    </template>
                    OpenSpec
                  </n-button>
                </span>
              </template>
              使用 openspec init 初始化项目
            </n-tooltip>
            <n-tooltip :disabled="hasSerena">
              <template #trigger>
                <span class="serena-button-wrapper">
                  <n-button size="small" secondary :disabled="!hasSerena" @click="handleOpenSerena">
                    <template #icon>
                      <n-icon><SparklesOutline /></n-icon>
                    </template>
                    Serena
                  </n-button>
                </span>
              </template>
              使用 serena init 初始化项目
            </n-tooltip>
            <n-dropdown
              :options="clearMenuOptions"
              trigger="click"
              @select="handleClearMenuSelect"
            >
              <n-button size="small" secondary>
                <template #icon>
                  <n-icon><TrashOutline /></n-icon>
                </template>
                清除历史
              </n-button>
            </n-dropdown>
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable Content -->
    <div class="content" :class="{ 'selection-active': store.selectionMode }" ref="contentEl">
      <!-- Loading -->
      <div v-if="store.loading" class="loading-container">
        <n-spin size="large">
          <template #description>
            加载会话列表...
          </template>
        </n-spin>
      </div>

      <!-- Error -->
      <n-alert v-else-if="store.error" type="error" title="加载失败" style="margin-bottom: 16px;">
        {{ store.error }}
      </n-alert>

      <template v-else>
        <!-- Selection Bar -->
        <div v-if="store.selectionMode" class="selection-bar">
          <n-space align="center">
            <n-button size="small" @click="handleExitSelection">取消</n-button>
            <n-text depth="3">已选 {{ selectedCount }}/{{ store.sessions.length }}</n-text>
            <n-checkbox
              :checked="allSelected"
              :indeterminate="indeterminate"
              @update:checked="handleSelectAll"
            >
              全选
            </n-checkbox>
            <n-button size="small" secondary @click="clearSelection">清空选择</n-button>
            <n-button
              size="small"
              type="error"
              :disabled="selectedCount === 0"
              @click="handleBatchDelete"
            >
              删除选中 ({{ selectedCount }})
            </n-button>
          </n-space>
        </div>

        <!-- Sessions List with Draggable -->
        <draggable
        v-if="filteredSessions.length > 0"
        :list="filteredSessions"
        item-key="sessionId"
        handle=".drag-handle"
        ghost-class="ghost"
        chosen-class="chosen"
        animation="200"
        :disabled="store.selectionMode || isFiltering"
        @end="handleDragEnd"
      >
        <template #item="{ element: session }">
          <div
            class="session-item"
            :class="{ selected: isSelected(session.sessionId) }"
            @mouseenter="hoveredSession = session.sessionId"
            @mouseleave="hoveredSession = null"
            @click="handleSessionClick(session)"
          >
            <div v-if="store.selectionMode" class="select-box">
              <n-checkbox
                :checked="isSelected(session.sessionId)"
                @click.stop
                @update:checked="(val) => handleSelectSession(session.sessionId, val)"
              />
            </div>
            <!-- Drag Handle -->
            <div v-if="!store.selectionMode" class="drag-handle">
              <n-icon size="16" color="#999">
                <ReorderThreeOutline />
              </n-icon>
            </div>

            <!-- Left Content -->
            <div class="session-left">
              <div class="session-icon">
                <n-icon size="24" color="#18a058">
                  <ChatbubbleEllipsesOutline />
                </n-icon>
              </div>

              <div class="session-info">
                <div class="session-header">
                  <div class="session-title-row">
                    <span class="session-title">
                      {{ session.alias ? `${session.alias} (${session.sessionId.substring(0, 8)})` : session.sessionId }}
                    </span>
                    <n-tooltip v-if="session.forkedFrom" placement="top">
                      <template #trigger>
                        <n-tag size="small" type="warning" :bordered="false" style="margin-left: 8px; cursor: help;">
                          <template #icon>
                            <n-icon><GitBranchOutline /></n-icon>
                          </template>
                          Fork
                        </n-tag>
                      </template>
                      Fork 自: {{ session.forkedFrom }}
                    </n-tooltip>
                    <n-tag
                      v-if="session.forkedFrom && isParentInTrash(session.forkedFrom)"
                      size="small"
                      type="error"
                      :bordered="false"
                      class="trash-tag"
                      @click.stop="handleOpenTrashFromFork"
                    >
                      已在回收站
                    </n-tag>
                    <div v-if="session.tags && session.tags.length" class="session-tag-list">
                      <n-tag
                        v-for="(tag, index) in session.tags.slice(0, 4)"
                        :key="`${session.sessionId}-${tag}-${index}`"
                        size="small"
                        :bordered="false"
                        :color="getTagColor(tag)"
                        class="session-tag"
                      >
                        {{ tag }}
                      </n-tag>
                    </div>
                  </div>
                </div>

                <div class="session-meta">
                  <n-text depth="3">{{ formatTime(session.mtime) }}</n-text>
                  <n-text depth="3">•</n-text>
                  <n-tag size="small" :bordered="false">{{ formatSize(session.size) }}</n-tag>
                </div>

                <n-text depth="3" class="session-message" v-if="session.firstMessage">
                  {{ truncateText(session.firstMessage, 80) }}
                </n-text>
                <n-text depth="3" class="session-message session-message-empty" v-else-if="!session.gitBranch && !session.summary">
                  暂未读取到对话内容
                </n-text>
              </div>
            </div>

            <!-- Right Content (上下布局) -->
            <div class="session-right">
              <!-- 上部：分支标签区域 -->
              <div class="session-tags-area">
                <n-tag v-if="session.gitBranch" size="small" type="info" :bordered="false">
                  <template #icon>
                    <n-icon><GitBranchOutline /></n-icon>
                  </template>
                  {{ session.gitBranch }}
                </n-tag>
              </div>

              <!-- 下部：操作按钮 -->
              <div v-if="!store.selectionMode" class="session-actions">
                <n-space>
                  <n-button
                    size="small"
                    type="error"
                    :class="['session-delete-button', { 'session-delete-button-hidden': hoveredSession !== session.sessionId }]"
                    @click.stop="handleDelete(session.sessionId)"
                  >
                    <template #icon>
                      <n-icon><TrashOutline /></n-icon>
                    </template>
                    删除
                  </n-button>
                  <n-button size="small" @click.stop="handleSetAlias(session)">
                    <template #icon>
                      <n-icon><CreateOutline /></n-icon>
                    </template>
                    别名
                  </n-button>
                  <n-button
                    size="small"
                    :type="isFavorite(currentChannel, projectName, session.sessionId) ? 'warning' : 'default'"
                    @click.stop="handleToggleFavorite(session)"
                  >
                    <template #icon>
                      <n-icon>
                        <Star v-if="isFavorite(currentChannel, projectName, session.sessionId)" />
                        <StarOutline v-else />
                      </n-icon>
                    </template>
                    {{ isFavorite(currentChannel, projectName, session.sessionId) ? '已收藏' : '收藏' }}
                  </n-button>
                  <n-button size="small" @click.stop="handleFork(session.sessionId)">
                    <template #icon>
                      <n-icon><GitBranchOutline /></n-icon>
                    </template>
                    Fork
                  </n-button>
                  <TerminalLauncher
                    :project-name="props.projectName"
                    :session-id="session.sessionId"
                    :channel="currentChannel"
                  />
                </n-space>
              </div>
            </div>
          </div>
        </template>
      </draggable>

        <!-- Empty State -->
        <n-empty
          v-else
          description="没有找到会话"
          style="margin-top: 60px;"
        >
          <template #icon>
            <n-icon><DocumentTextOutline /></n-icon>
          </template>
        </n-empty>
      </template>
    </div>

    <!-- Alias Dialog -->
    <AliasModal
      v-model:visible="showAliasModal"
      :session="editingSession"
      :project-name="props.projectName"
      @saved="handleAliasSaved"
    />

    <DeleteConfirmModal
      v-model:visible="showDeleteConfirm"
      :sessions="pendingDeleteSessions"
      @confirm="confirmBatchDelete"
      @cancel="handleCancelBatchDelete"
    />

    <TrashModal
      v-model:visible="showTrashModal"
      :items="store.trashItems"
      :loading="store.trashLoading"
      @restore="handleRestoreTrash"
      @permanent-delete="handlePermanentDelete"
      @view="handleViewTrashItem"
      @empty-trash="handleEmptyTrash"
    />

    <AliasConflictModal
      v-model:visible="showAliasConflictModal"
      :conflicts="aliasConflicts"
      @resolve="handleAliasConflictResolve"
    />

    <!-- Search Results Dialog -->
    <n-modal v-model:show="showSearchResults" preset="card" title="搜索结果" style="width: 1200px;" :z-index="900">
      <div v-if="searchResults" style="max-height: 70vh; overflow-y: auto;">
        <n-alert type="info" style="margin-bottom: 16px;">
          关键词 "{{ searchResults.keyword }}" 共找到 {{ searchResults.totalMatches }} 处匹配
        </n-alert>

        <div
          v-for="session in searchResults.sessions"
          :key="session.sessionId"
          class="search-result-item"
          @click="handleViewChatHistory(session)"
        >
          <div class="search-result-header">
            <div class="search-result-title">
              <n-text strong>
                {{ session.alias ? `${session.alias} (${session.sessionId.substring(0, 8)})` : session.sessionId.substring(0, 8) }}
              </n-text>
              <n-tag size="small" :bordered="false">{{ session.matchCount }} 个匹配</n-tag>
            </div>
            <div @click.stop>
              <TerminalLauncher
                :project-name="props.projectName"
                :session-id="session.sessionId"
                :channel="currentChannel"
              />
            </div>
          </div>
          <div v-for="(match, idx) in session.matches" :key="idx" class="search-match">
            <n-tag
              size="tiny"
              :type="match.role === 'user' ? 'info' : (match.role === 'tag' ? 'warning' : 'success')"
              :bordered="false"
            >
              {{ match.role === 'user' ? '用户' : (match.role === 'tag' ? '标签' : '助手') }}
            </n-tag>
            <n-text depth="3" class="search-match-text" v-html="highlightKeyword(match.context, searchResults.keyword)"></n-text>
          </div>
        </div>

        <n-empty v-if="searchResults.sessions.length === 0" description="没有找到匹配的内容" />
      </div>
    </n-modal>

    <!-- Chat History Drawer -->
    <ChatHistoryDrawer
      ref="chatHistoryRef"
      v-if="selectedSessionId"
      v-model:show="showChatHistory"
      :project-name="props.projectName"
      :session-id="selectedSessionId"
      :session-alias="selectedSessionAlias"
      :trash-id="selectedTrashId"
      :channel="currentChannel"
      @error="handleChatHistoryError"
    />

    <!-- OpenSpec Drawer -->
    <OpenSpecDrawer
      v-model:show="showOpenSpecDrawer"
      :project-name="projectDisplayName"
      :project-path="store.currentProjectInfo?.fullPath || ''"
      :channel="currentChannel"
    />

    <!-- Serena Drawer -->
    <SerenaDrawer
      v-model:show="showSerenaDrawer"
      :project-name="projectDisplayName"
      :project-path="store.currentProjectInfo?.fullPath || ''"
      :channel="currentChannel"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NButton, NIcon, NH2, NText, NInput, NSpin, NAlert, NEmpty, NSelect,
  NTag, NSpace, NModal, NTooltip, NDropdown, NCheckbox
} from 'naive-ui'
import {
  ArrowBackOutline, SearchOutline, DocumentTextOutline,
  ChatbubbleEllipsesOutline, GitBranchOutline, CreateOutline, TrashOutline,
  ReorderThreeOutline, StarOutline, Star, TimeOutline,
  CheckmarkCircleOutline, ArchiveOutline, SparklesOutline
} from '@vicons/ionicons5'
import draggable from 'vuedraggable'
import { useSessionsStore } from '../stores/sessions'
import { useFavorites } from '../composables/useFavorites'
import message, { dialog } from '../utils/message'
import { searchSessions as searchSessionsApi } from '../api/sessions'
import { getTagColor } from '../utils/tag-color'
import ChatHistoryDrawer from '../components/ChatHistoryDrawer.vue'
import TerminalLauncher from '../components/TerminalLauncher.vue'
import OpenSpecDrawer from '../components/openspecui/OpenSpecDrawer.vue'
import SerenaDrawer from '../components/serenaui/SerenaDrawer.vue'
import AliasModal from '../components/AliasModal.vue'
import TrashModal from '../components/TrashModal.vue'
import DeleteConfirmModal from '../components/DeleteConfirmModal.vue'
import AliasConflictModal from '../components/AliasConflictModal.vue'

const props = defineProps({
  projectName: {
    type: String,
    required: true
  }
})

const router = useRouter()
const route = useRoute()
const store = useSessionsStore()
const { addFavorite, removeFavorite, isFavorite } = useFavorites()

// 当前渠道
const currentChannel = computed(() => route.meta.channel || 'claude')

const searchQuery = ref('')
const selectedTags = ref([])
const showAliasModal = ref(false)
const editingSession = ref(null)
const hoveredSession = ref(null)
const orderedSessions = ref([])
const searchResults = ref(null)
const showSearchResults = ref(false)
const contentEl = ref(null)
const searching = ref(false)
const showOpenSpecDrawer = ref(false)
const showSerenaDrawer = ref(false)
const showTrashModal = ref(false)
const showDeleteConfirm = ref(false)
const pendingDeleteSessions = ref([])
const showAliasConflictModal = ref(false)
const aliasConflicts = ref([])
const pendingRestoreTrashIds = ref([])
const selectedTrashId = ref('')

// Chat history drawer state
const showChatHistory = ref(false)
const selectedSessionId = ref('')
const selectedSessionAlias = ref('')
const chatHistoryRef = ref(null)

// Project display name (使用后端解析的名称)
const projectDisplayName = computed(() => {
  return store.currentProjectInfo?.displayName || props.projectName
})

// Full project path (使用后端解析的路径)
const displayProjectPath = computed(() => {
  return store.currentProjectInfo?.fullPath || props.projectName
})

const hasOpenSpec = computed(() => {
  return Boolean(store.currentProjectInfo?.hasOpenSpec)
})

const hasSerena = computed(() => {
  return Boolean(store.currentProjectInfo?.hasSerena)
})

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) })
}


// Sync with store
watch(() => store.sessionsWithAlias, (newSessions) => {
  orderedSessions.value = [...newSessions]
  if (!selectedTags.value.length) return
  const available = new Set()
  newSessions.forEach(session => {
    (session.tags || []).forEach(tag => available.add(String(tag)))
  })
  selectedTags.value = selectedTags.value.filter(tag => available.has(String(tag)))
}, { immediate: true })

const tagFilterOptions = computed(() => {
  const tagSet = new Set()
  orderedSessions.value.forEach(session => {
    (session.tags || []).forEach(tag => {
      const normalized = String(tag).trim()
      if (normalized) {
        tagSet.add(normalized)
      }
    })
  })
  return Array.from(tagSet)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map(tag => ({ label: tag, value: tag }))
})

const filteredSessions = computed(() => {
  let result = orderedSessions.value
  if (selectedTags.value.length > 0) {
    const requiredTags = selectedTags.value
      .map(tag => String(tag).trim().toLowerCase())
      .filter(Boolean)
    result = result.filter(session => {
      const sessionTags = (session.tags || [])
        .map(tag => String(tag).trim().toLowerCase())
        .filter(Boolean)
      if (sessionTags.length === 0) return false
      return requiredTags.some(tag => sessionTags.includes(tag))
    })
  }

  if (!searchQuery.value) return result

  const query = searchQuery.value.toLowerCase().trim()
  return result.filter(session => {
    return (
      session.sessionId.toLowerCase().includes(query) ||
      (session.alias && session.alias.toLowerCase().includes(query)) ||
      (session.firstMessage && session.firstMessage.toLowerCase().includes(query)) ||
      (session.gitBranch && session.gitBranch.toLowerCase().includes(query)) ||
      (session.tags && session.tags.some(tag => String(tag).toLowerCase().includes(query)))
    )
  })
})

const isFiltering = computed(() => {
  return selectedTags.value.length > 0 || Boolean(searchQuery.value)
})

const selectedCount = computed(() => store.selectedSessions.size)
const allSelected = computed(() => {
  if (filteredSessions.value.length === 0) return false
  return store.selectedSessions.size === filteredSessions.value.length
})
const indeterminate = computed(() => {
  return store.selectedSessions.size > 0 && store.selectedSessions.size < filteredSessions.value.length
})
const trashCount = computed(() => store.trashItems.length)
const trashSessionIds = computed(() => new Set(store.trashItems.map(item => item.sessionId)))

const clearMenuOptions = computed(() => ([
  {
    label: '选择模式',
    key: 'select',
    icon: renderIcon(CheckmarkCircleOutline)
  },
  {
    label: '清理30天前',
    key: 'clear-30',
    icon: renderIcon(TimeOutline)
  },
  {
    label: '清空所有会话',
    key: 'clear',
    icon: renderIcon(TrashOutline)
  },
  { type: 'divider' },
  {
    label: () => h('span', { class: 'trash-option' }, [
      h('span', null, `回收站 (${trashCount.value})`),
      trashCount.value > 0 ? h('span', { class: 'trash-option-dot' }) : null
    ]),
    key: 'trash',
    icon: renderIcon(ArchiveOutline)
  }
]))

function goBack() {
  const channel = route.meta.channel || 'claude'
  router.push({ name: `${channel}-projects` })
}

function handleOpenSpec() {
  if (!hasOpenSpec.value) return
  showOpenSpecDrawer.value = true
}

function handleOpenSerena() {
  if (!hasSerena.value) return
  showSerenaDrawer.value = true
}

async function handleClearMenuSelect(key) {
  if (key === 'select') {
    store.enterSelectionMode()
    return
  }
  if (key === 'clear-30') {
    handleClearOlderThan(30)
    return
  }
  if (key === 'clear') {
    if (store.sessions.length === 0) {
      message.info('当前没有可清理的会话')
      return
    }
    pendingDeleteSessions.value = [...store.sessionsWithAlias]
    showDeleteConfirm.value = true
    return
  }
  if (key === 'trash') {
    await openTrashModal()
  }
}

function handleClearOlderThan(days) {
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000
  const targets = store.sessionsWithAlias.filter(session => {
    const time = new Date(session.mtime).getTime()
    return Number.isFinite(time) && time < threshold
  })

  if (targets.length === 0) {
    message.info(`没有超过 ${days} 天的会话`)
    return
  }

  pendingDeleteSessions.value = targets
  showDeleteConfirm.value = true
}

async function handleSearch() {
  if (!searchQuery.value) return

  searching.value = true
  try {
    // 增加上下文长度到 35 (15 + 20)
    const data = await searchSessionsApi(props.projectName, searchQuery.value, 35, currentChannel.value)
    searchResults.value = data
    showSearchResults.value = true
  } catch (err) {
    message.error('搜索失败: ' + err.message)
  } finally {
    searching.value = false
  }
}

async function handleDragEnd() {
  if (isFiltering.value) return
  const order = orderedSessions.value.map(s => s.sessionId)
  await store.saveSessionOrder(order)
}

function handleExitSelection() {
  store.exitSelectionMode()
}

function handleSelectSession(sessionId, checked) {
  store.toggleSelection(sessionId, checked)
}

function handleSelectAll(checked) {
  if (checked) {
    store.selectedSessions = new Set(filteredSessions.value.map(session => session.sessionId))
  } else {
    store.selectedSessions = new Set()
  }
}

function clearSelection() {
  store.selectedSessions = new Set()
}

function isSelected(sessionId) {
  return store.selectedSessions.has(sessionId)
}

function handleSetAlias(session) {
  editingSession.value = session
  showAliasModal.value = true
}

async function handleAliasSaved({ sessionId, title, tags }) {
  try {
    if (title) {
      await store.setAlias(sessionId, title)
    } else {
      await store.deleteAlias(sessionId)
    }
    store.setMetadataCache(sessionId, { title: title || '', tags: tags || [] })
  } catch (err) {
    message.error('同步别名失败: ' + err.message)
  }
}

async function handleFork(sessionId) {
  try {
    await store.forkSession(sessionId)
    message.success('Fork 成功!')
  } catch (err) {
    message.error('Fork 失败: ' + err.message)
  }
}

function handleSessionClick(session) {
  if (store.selectionMode) {
    store.toggleSelection(session.sessionId)
    return
  }
  handleViewChatHistory(session)
}

// View chat history
function handleViewChatHistory(session) {
  selectedSessionId.value = session.sessionId
  selectedSessionAlias.value = session.alias || ''
  selectedTrashId.value = ''
  showChatHistory.value = true
  nextTick(() => {
    chatHistoryRef.value?.open()
  })
}

// Handle chat history error
function handleChatHistoryError(errorMsg) {
  message.error(errorMsg)
}

function handleDelete(sessionId) {
  const target = store.sessionsWithAlias.find(session => session.sessionId === sessionId)
  if (!target) return
  pendingDeleteSessions.value = [target]
  showDeleteConfirm.value = true
}

function handleBatchDelete() {
  if (store.selectedSessions.size === 0) return
  const selectedIds = new Set(store.selectedSessions)
  pendingDeleteSessions.value = store.sessionsWithAlias.filter(session => selectedIds.has(session.sessionId))
  showDeleteConfirm.value = true
}

function handleCancelBatchDelete() {
  showDeleteConfirm.value = false
  pendingDeleteSessions.value = []
}

async function confirmBatchDelete() {
  const ids = pendingDeleteSessions.value.map(session => session.sessionId)
  if (ids.length === 0) return
  try {
    const result = await store.batchDelete(ids)
    await store.fetchTrash()
    if (result.failed) {
      message.warning(`部分会话删除失败：成功 ${result.deleted}，失败 ${result.failed}`)
    } else {
      message.success('会话已移入回收站')
    }
    showDeleteConfirm.value = false
    pendingDeleteSessions.value = []
  } catch (err) {
    message.error('删除失败: ' + err.message)
  }
}

async function openTrashModal() {
  showTrashModal.value = true
  try {
    await store.fetchTrash(props.projectName)
  } catch (err) {
    message.error('回收站加载失败: ' + err.message)
  }
}

function handleOpenTrashFromFork() {
  openTrashModal()
}

function isParentInTrash(sessionId) {
  return trashSessionIds.value.has(sessionId)
}

function handleViewTrashItem(trashId) {
  const target = store.trashItems.find(item => item.trashId === trashId)
  if (!target) {
    message.error('未找到回收站会话')
    return
  }
  selectedSessionId.value = target.sessionId
  selectedSessionAlias.value = target.alias || ''
  selectedTrashId.value = trashId
  showChatHistory.value = true
  nextTick(() => {
    chatHistoryRef.value?.open()
  })
}

async function handleRestoreTrash(trashIds) {
  try {
    const result = await store.restoreFromTrash(trashIds)
    if (result.conflicts && result.conflicts.length > 0) {
      aliasConflicts.value = result.conflicts
      pendingRestoreTrashIds.value = result.conflicts.map(conflict => conflict.trashId)
      showAliasConflictModal.value = true
      return
    }
    message.success('会话已恢复')
  } catch (err) {
    message.error('恢复失败: ' + err.message)
  }
}

async function handleAliasConflictResolve(strategy) {
  try {
    const result = await store.restoreFromTrash(pendingRestoreTrashIds.value, strategy)
    if (result.success) {
      message.success('会话已恢复')
    } else {
      message.warning('仍有别名冲突未解决')
    }
  } catch (err) {
    message.error('恢复失败: ' + err.message)
  } finally {
    showAliasConflictModal.value = false
    aliasConflicts.value = []
    pendingRestoreTrashIds.value = []
  }
}

function handlePermanentDelete(trashId) {
  dialog.warning({
    title: '永久删除',
    content: '确定要永久删除该会话吗？此操作不可恢复。',
    positiveText: '确定删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const result = await store.deleteTrashItem(trashId)
        if (result.success) {
          message.success('已永久删除')
        } else {
          message.warning('删除失败')
        }
      } catch (err) {
        message.error('删除失败: ' + err.message)
      }
    }
  })
}

function handleEmptyTrash() {
  dialog.warning({
    title: '清空回收站',
    content: '确定要清空回收站吗？此操作不可恢复。',
    positiveText: '确定清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await store.emptyTrash()
        message.success('回收站已清空')
      } catch (err) {
        message.error('清空失败: ' + err.message)
      }
    }
  })
}

// 切换收藏状态
async function handleToggleFavorite(session) {
  const channel = currentChannel.value
  const favorited = isFavorite(channel, props.projectName, session.sessionId)

  try {
    if (favorited) {
      await removeFavorite(channel, props.projectName, session.sessionId)
      message.success('已取消收藏')
    } else {
      const sessionData = {
        sessionId: session.sessionId,
        projectName: props.projectName,
        projectDisplayName: projectDisplayName.value,
        projectFullPath: displayProjectPath.value,
        alias: session.alias || '',
        firstMessage: session.firstMessage || '',
        mtime: session.mtime,
        size: session.size,
        gitBranch: session.gitBranch || '',
        forkedFrom: session.forkedFrom || ''
      }
      await addFavorite(channel, sessionData)
      message.success('已添加到收藏')
    }
  } catch (err) {
    message.error('操作失败: ' + err.message)
  }
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  if (bytes < k) return bytes + ' B'
  if (bytes < k * k) return (bytes / k).toFixed(1) + ' KB'
  return (bytes / k / k).toFixed(1) + ' MB'
}

// 高亮关键字
function highlightKeyword(text, keyword) {
  if (!keyword || !text) return text
  const regex = new RegExp(`(${keyword})`, 'gi')
  return text.replace(regex, '<mark style="background-color: #ffd700; padding: 2px 4px; border-radius: 2px; font-weight: 600;">$1</mark>')
}

// 截断文本
function truncateText(text, maxLength = 80) {
  if (!text) return ''
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...'
  }
  return text
}

function formatSelectedTags(values) {
  if (!values || values.length === 0) return ''
  return `已选 ${values.length} 个`
}

// 保存和恢复滚动位置
async function refreshDataWithScrollPreservation() {
  // Save scroll position
  const scrollTop = contentEl.value?.scrollTop || 0

  // Fetch data
  await store.fetchSessions(props.projectName)

  // Restore scroll position after DOM update
  await nextTick()
  if (contentEl.value) {
    contentEl.value.scrollTop = scrollTop
  }
}

// 【暂时移除】页面可见性变化时刷新数据
// 原因：每次切换回来就刷新，体验不好
// function handleVisibilityChange() {
//   if (document.visibilityState === 'visible') {
//     refreshDataWithScrollPreservation()
//   }
// }

// 【暂时移除】窗口获得焦点时刷新数据
// 原因：每次切换回来就刷新，体验不好
// function handleWindowFocus() {
//   refreshDataWithScrollPreservation()
// }

// 监听 channel 变化
watch(currentChannel, async (newChannel) => {
  store.setChannel(newChannel)
  selectedTags.value = []
  try {
    await store.fetchSessions(props.projectName)
    await store.fetchTrash(props.projectName)
  } catch (err) {
    // 由 store.error 统一处理
  }
}, { immediate: true })

watch(() => props.projectName, (newProject) => {
  if (!newProject) return
  selectedTags.value = []
  store.fetchSessions(newProject, { force: true }).then(() => {
    store.fetchTrash(newProject).catch(() => {})
  }).catch(() => {})
  store.exitSelectionMode()
})

onMounted(() => {
  // 【暂时移除】添加事件监听 - 每次切换回来就刷新，体验不好
  // document.addEventListener('visibilitychange', handleVisibilityChange)
  // window.addEventListener('focus', handleWindowFocus)
})

onUnmounted(() => {
  // 【暂时移除】清理事件监听
  // document.removeEventListener('visibilitychange', handleVisibilityChange)
  // window.removeEventListener('focus', handleWindowFocus)
  store.exitSelectionMode()
})
</script>

<style scoped>
.session-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.header {
  flex-shrink: 0;
  padding: 24px 24px 16px 24px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-primary);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 24px 24px;
}

.content.selection-active {
  padding-top: 0;
}

.back-button {
  flex-shrink: 0;
  margin-right: 12px;
}

.title-bar {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.title-section {
  flex: 1;
  min-width: 0;
}

.title-with-count {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.title-section h2 {
  margin: 0;
  font-size: 20px;
}

.session-count {
  font-size: 14px;
  color: #666;
}

.total-size-tag {
  margin-left: 8px;
}

.project-path {
  font-size: 13px;
  display: block;
  color: #666;
  margin-bottom: 2px;
}

.search-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
}

.openspec-button-wrapper {
  display: inline-flex;
}

.serena-button-wrapper {
  display: inline-flex;
}

.search-input {
  width: 320px;
  flex-shrink: 0;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.tag-filter-select {
  width: 200px;
  flex-shrink: 0;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.selection-bar {
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  margin-bottom: 12px;
  position: sticky;
  top: 8px;
  z-index: 5;
}

.selection-bar::before {
  content: '';
  position: absolute;
  top: -9px;
  left: -1px;
  right: -1px;
  height: 8px;
  background: var(--bg-primary);
  pointer-events: none;
}

/* Session Item */
.session-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all 0.2s;
  cursor: pointer;
}

.session-item.selected {
  border-color: #4f7cff;
  background: #f6f8ff;
}

.select-box {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.session-item:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.1);
}

.drag-handle {
  cursor: move;
  width: 24px;
  height: 24px;
  padding: 4px;
  opacity: 0.4;
  transition: all 0.2s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-item:hover .drag-handle {
  opacity: 1;
  background-color: rgba(24, 160, 88, 0.1);
  border-radius: 4px;
}

/* Left Content - 左侧内容区 */
.session-left {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.session-icon {
  flex-shrink: 0;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.session-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-delete-button-hidden {
  visibility: hidden;
  pointer-events: none;
}

.session-tag-list {
  display: flex;
  flex-wrap: nowrap;
  overflow: hidden;
  min-width: 0;
  gap: 6px;
}

.session-tag {
  margin-left: 0;
}

.trash-tag {
  margin-left: 6px;
  cursor: pointer;
}

.trash-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.trash-option-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f0a020;
}

.session-title {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.session-message {
  display: block;
  max-width: 600px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.session-message-empty {
  font-style: italic;
  opacity: 0.5;
}

/* Right Content - 右侧内容区（上下布局） */
.session-right {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-end;
  min-width: 280px;
  flex-shrink: 0;
  gap: 12px;
}

.session-tags-area {
  min-height: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.session-actions {
  display: flex;
  align-items: center;
  margin-top: auto;
}

/* Draggable states */
.ghost {
  opacity: 0.4;
}

.chosen {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

/* Search Results */
.search-result-item {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-elevated);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-result-item:hover {
  border-color: var(--n-primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.search-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.search-result-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-match {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 6px;
  padding: 6px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.search-match-text {
  flex: 1;
  line-height: 1.6;
}
</style>
