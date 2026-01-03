<template>
  <n-modal
    :show="visible"
    @update:show="updateVisible"
    preset="card"
    title="设置别名与标签"
    style="width: 500px"
    :segmented="{ content: 'soft', footer: 'soft' }"
  >
    <n-form label-placement="top">
      <n-form-item label="会话标题">
        <n-input
          v-model:value="metadata.title"
          placeholder="输入标题或点击自动生成"
          clearable
        />
      </n-form-item>
      <n-form-item label="会话标签">
        <n-select
          v-model:value="metadata.tags"
          multiple
          filterable
          tag
          clearable
          placeholder="选择或输入标签"
          :max-tag-count="MAX_TAG_COUNT"
          :options="presetTagsOptions"
        />
      </n-form-item>
    </n-form>

    <template #footer>
      <n-space justify="end">
        <n-button :loading="generating" @click="handleGenerate">
          自动生成
        </n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          保存
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { NModal, NForm, NFormItem, NInput, NSelect, NSpace, NButton } from 'naive-ui'
import {
  generateAlias,
  getSessionMetadata,
  setSessionMetadata,
  deleteSessionMetadata,
  getPresetTags
} from '../api/ai'
import message from '../utils/message'

const MAX_TAG_COUNT = 4

const props = defineProps({
  visible: Boolean,
  session: Object,
  projectName: String
})

const emit = defineEmits(['update:visible', 'saved'])

const metadata = ref({
  title: '',
  tags: []
})
const presetTags = ref([])
const generating = ref(false)
const saving = ref(false)

const presetTagsOptions = computed(() => {
  const tagSet = new Set(presetTags.value || [])
  metadata.value.tags.forEach(tag => tagSet.add(tag))
  return Array.from(tagSet).map(tag => ({ label: tag, value: tag }))
})

const updateVisible = (val) => {
  emit('update:visible', val)
}

const loadMetadata = async () => {
  if (!props.session?.sessionId) return

  try {
    const [metaRes, tagsRes] = await Promise.all([
      getSessionMetadata(props.session.sessionId),
      getPresetTags()
    ])

    if (metaRes.success && metaRes.data) {
      metadata.value = {
        title: metaRes.data.title || props.session.alias || '',
        tags: metaRes.data.tags || []
      }
    } else {
      metadata.value = {
        title: props.session.alias || '',
        tags: []
      }
    }

    if (tagsRes.success) {
      presetTags.value = tagsRes.tags || []
    }
  } catch (error) {
    console.error('Failed to load metadata:', error)
    metadata.value = {
      title: props.session?.alias || '',
      tags: []
    }
  }
}

watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadMetadata()
  }
})

watch(() => metadata.value.tags, (tags) => {
  if (!Array.isArray(tags)) return
  if (tags.length <= MAX_TAG_COUNT) return
  metadata.value.tags = tags.slice(0, MAX_TAG_COUNT)
  message.warning(`最多只能添加 ${MAX_TAG_COUNT} 个标签`)
}, { deep: true })

const handleGenerate = async () => {
  if (!props.session?.sessionId || !props.projectName) return

  generating.value = true
  try {
    const res = await generateAlias({
      projectName: props.projectName,
      sessionId: props.session.sessionId
    })

    if (res.success && res.data) {
      metadata.value.title = res.data.title
      metadata.value.tags = res.data.tags
      message.success('已自动生成标题和标签')
    } else {
      message.error(res.error || '生成失败')
    }
  } catch (error) {
    message.error(error.response?.data?.error || '生成出错')
  } finally {
    generating.value = false
  }
}

const handleSave = async () => {
  if (!props.session?.sessionId) return

  saving.value = true
  try {
    const { title, tags } = metadata.value
    let res
    if (!title && (!tags || tags.length === 0)) {
      res = await deleteSessionMetadata(props.session.sessionId)
    } else {
      res = await setSessionMetadata(props.session.sessionId, { title, tags })
    }

    if (res.success) {
      message.success('保存成功')
      if (res.warning) {
        message.warning(res.warning)
      }
      emit('saved', { sessionId: props.session.sessionId, title, tags })
      updateVisible(false)
    } else {
      message.error(res.error || '保存失败')
    }
  } catch (error) {
    message.error(error.response?.data?.error || '保存出错')
  } finally {
    saving.value = false
  }
}
</script>
