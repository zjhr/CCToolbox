<template>
  <n-drawer v-model:show="show" :width="drawerWidth" placement="right" :show-close="true">
    <n-drawer-content :title="getChannelTitle()" :native-scrollbar="false" closable>
      <div v-if="loading" class="loading-container">
        <n-spin size="medium">
          <template #description>加载中...</template>
        </n-spin>
      </div>

      <div v-else-if="sessions.length > 0" class="sessions-list">
        <SessionCard
          v-for="session in sessions"
          :key="session.sessionId"
          :session="session"
          :show-project="true"
          :hide-fork="true"
          :hide-delete="true"
          @set-alias="handleSetAlias"
          :channel="props.channel"
        />
      </div>

      <n-empty
        v-else
        description="暂无最近使用的会话"
        style="margin-top: 60px;"
      >
        <template #icon>
          <n-icon size="48"><ChatbubblesOutline /></n-icon>
        </template>
      </n-empty>
    </n-drawer-content>
  </n-drawer>

  <AliasModal
    v-model:visible="showAliasModal"
    :session="editingSession"
    :project-name="aliasProjectName"
    @saved="handleAliasSaved"
  />
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NDrawer, NDrawerContent, NSpin, NEmpty, NIcon } from 'naive-ui'
import { ChatbubblesOutline } from '@vicons/ionicons5'
import SessionCard from './SessionCard.vue'
import AliasModal from './AliasModal.vue'
import {
  getRecentSessions,
  setAlias as setAliasApi,
  deleteAlias as deleteAliasApi
} from '../api/sessions'
import message from '../utils/message'
import { useResponsiveDrawer } from '../composables/useResponsiveDrawer'

const { drawerWidth } = useResponsiveDrawer(800, 700)

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  channel: {
    type: String,
    default: 'claude'
  }
})

const emit = defineEmits(['update:visible'])

const show = ref(false)
const sessions = ref([])
const loading = ref(false)
const showAliasModal = ref(false)
const editingSession = ref(null)

const aliasProjectName = computed(() => editingSession.value?.projectName || '')

// 获取渠道标题
function getChannelTitle() {
  if (props.channel === 'claude') return 'Claude 最新对话'
  if (props.channel === 'codex') return 'Codex 最新对话'
  if (props.channel === 'gemini') return 'Gemini 最新对话'
  return '最新对话'
}

// Sync with props
watch(() => props.visible, (val) => {
  show.value = val
  if (val) {
    loadSessions()
  }
})

// Sync with show
watch(show, (val) => {
  emit('update:visible', val)
})

async function loadSessions() {
  loading.value = true
  try {
    const data = await getRecentSessions(10, props.channel)
    sessions.value = data.sessions
  } catch (err) {
    console.error('Failed to load recent sessions:', err)
    message.error('加载失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

// 监听 channel 变化，重新加载会话
watch(() => props.channel, () => {
  if (show.value) {
    loadSessions()
  }
})

function handleSetAlias(session) {
  editingSession.value = session
  showAliasModal.value = true
}

async function handleAliasSaved({ sessionId, title }) {
  try {
    if (title) {
      await setAliasApi(sessionId, title)
      message.success('别名设置成功')
    } else {
      await deleteAliasApi(sessionId)
      message.success('别名已删除')
    }
    await loadSessions()
  } catch (err) {
    message.error('操作失败: ' + err.message)
  }
}
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
</style>
