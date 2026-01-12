<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    title="全局搜索"
    :z-index="900"
    style="width: 900px; max-width: 90vw;"
    :style="{ marginTop: '80px' }"
  >
    <div class="search-input">
      <n-input
        ref="searchInputRef"
        v-model:value="searchQuery"
        placeholder="搜索所有项目的对话内容..."
        clearable
        @keyup.enter="handleSearch"
        :disabled="searching"
      >
        <template #prefix>
          <n-icon><SearchOutline /></n-icon>
        </template>
        <template #suffix>
          <n-button
            text
            @click="handleSearch"
            :disabled="!searchQuery || searching"
            :loading="searching"
          >
            搜索
          </n-button>
        </template>
      </n-input>
    </div>

    <div v-if="searchResults" class="search-results">
      <n-alert type="info" class="search-summary">
        关键词 "{{ searchResults.keyword }}" 共找到 {{ searchResults.totalMatches }} 处匹配
      </n-alert>

      <div
        v-for="session in searchResults.sessions"
        :key="`${session.projectName}-${session.sessionId}`"
        class="search-result-item"
        @click="openSession(session)"
      >
        <div class="search-result-header">
          <div class="search-result-title">
            <n-text strong class="project-name">
              {{ getProjectLabel(session) }}
            </n-text>
            <n-text depth="2" class="divider">·</n-text>
            <n-text strong>
              {{ getSessionLabel(session) }}
            </n-text>
            <n-tag size="small" :bordered="false">{{ session.matchCount }} 个匹配</n-tag>
          </div>
        </div>
        <div v-for="(match, idx) in session.matches || []" :key="idx" class="search-match">
          <n-tag size="tiny" :type="getRoleTagType(match.role)" :bordered="false">
            {{ getRoleLabel(match.role) }}
          </n-tag>
          <n-text
            depth="3"
            class="search-match-text"
            v-html="highlightKeyword(match.context, searchResults.keyword)"
          />
        </div>
      </div>

      <n-empty v-if="searchResults.sessions.length === 0" description="没有找到匹配的内容" />
    </div>
  </n-modal>

  <ChatHistoryDrawer
    v-if="selectedSessionId"
    ref="chatHistoryRef"
    v-model:show="showDrawer"
    :project-name="selectedProjectName"
    :session-id="selectedSessionId"
    :session-alias="selectedSessionAlias"
    :channel="channel"
    @error="handleDrawerError"
  />
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { NModal, NInput, NIcon, NButton, NAlert, NTag, NText, NEmpty } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import ChatHistoryDrawer from './ChatHistoryDrawer.vue'
import message from '../utils/message'
import { searchSessionsAcrossProjects } from '../api/search'
import { searchSessionsGlobally } from '../api/sessions'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  channel: {
    type: String,
    default: 'claude'
  }
})

const emit = defineEmits(['update:show'])

const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const searchQuery = ref('')
const searching = ref(false)
const searchResults = ref(null)
const searchInputRef = ref(null)

const showDrawer = ref(false)
const selectedSessionId = ref('')
const selectedProjectName = ref('')
const selectedSessionAlias = ref('')
const chatHistoryRef = ref(null)

watch(visible, (value) => {
  if (!value) {
    resetState()
    return
  }
  nextTick(() => {
    searchInputRef.value?.focus()
  })
})

function resetState() {
  searchQuery.value = ''
  searchResults.value = null
  showDrawer.value = false
  selectedSessionId.value = ''
  selectedProjectName.value = ''
  selectedSessionAlias.value = ''
}

async function handleSearch() {
  if (!searchQuery.value) return
  searching.value = true
  try {
    const data = props.channel === 'claude'
      ? await searchSessionsAcrossProjects(searchQuery.value, 35)
      : await searchSessionsGlobally(searchQuery.value, 35, props.channel)
    searchResults.value = data
  } catch (err) {
    message.error('搜索失败: ' + (err?.message || '未知错误'))
  } finally {
    searching.value = false
  }
}

function openSession(session) {
  selectedSessionId.value = session.sessionId
  selectedProjectName.value = session.projectName || session.projectHash || ''
  selectedSessionAlias.value = session.alias || ''
  showDrawer.value = true
  nextTick(() => {
    chatHistoryRef.value?.open?.()
  })
}

function handleDrawerError(err) {
  if (!err) return
  message.error(err.message || '加载对话失败')
}

function highlightKeyword(text, keyword) {
  if (!keyword || !text) return text
  const regex = new RegExp(`(${keyword})`, 'gi')
  return text.replace(regex, '<mark class="search-highlight">$1</mark>')
}

function getRoleLabel(role) {
  if (role === 'user') return '用户'
  if (role === 'tag') return '标签'
  return '助手'
}

function getRoleTagType(role) {
  if (role === 'user') return 'info'
  if (role === 'tag') return 'warning'
  return 'success'
}

function getProjectLabel(session) {
  if (session.projectDisplayName) return session.projectDisplayName
  if (session.projectName) return session.projectName
  if (session.projectHash) return `Project ${session.projectHash.substring(0, 8)}`
  return '未知项目'
}

function getSessionLabel(session) {
  if (session.alias) {
    return `${session.alias} (${session.sessionId.substring(0, 8)})`
  }
  return session.sessionId.substring(0, 8)
}
</script>

<style scoped>
.search-input {
  margin-bottom: 16px;
}

.search-results {
  max-height: 60vh;
  overflow-y: auto;
}

.search-summary {
  margin-bottom: 16px;
}

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
  flex-wrap: wrap;
}

.project-name {
  font-size: 15px;
  font-weight: 700;
}

.divider {
  margin: 0 4px;
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

.search-highlight {
  background-color: #ffd700;
  padding: 2px 4px;
  border-radius: 2px;
  font-weight: 600;
}
</style>
