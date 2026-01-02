<template>
  <n-modal
    v-model:show="show"
    preset="card"
    title="隐私与数据使用声明"
    style="width: 500px; max-width: 90vw;"
    :mask-closable="false"
    :closable="false"
  >
    <div class="privacy-content">
      <p>在使用 AI 增强功能之前，请阅读并知晓以下事项：</p>
      <ul>
        <li>
          <n-text strong>第三方服务：</n-text>
          如果您选择使用 OpenAI 或 Gemini 等在线模型，您的会话内容将被发送到相应的第三方服务商。
        </li>
        <li>
          <n-text strong>隐私保护：</n-text>
          API Key 仅保存在您的本地配置文件中，并会进行加密处理，不会上传到服务器。
        </li>
        <li>
          <n-text strong>本地方案：</n-text>
          为了获得最佳的隐私保护，我们强烈推荐您通过 <n-text code>Ollama</n-text> 使用本地模型，数据将完全留在您的机器上。
        </li>
        <li>
          <n-text strong>随时更改：</n-text>
          您可以随时在“设置 -> AI 配置”中更改这些选项或撤销同意。
        </li>
      </ul>
      <n-alert type="info" :bordered="false" style="margin-top: 16px;">
        点击“同意并继续”即表示您理解并同意上述数据处理方式。
      </n-alert>
    </div>
    <template #footer>
      <n-space justify="end">
        <n-button @click="handleDecline">暂不使用</n-button>
        <n-button type="primary" @click="handleAccept">同意并继续</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup>
import { computed } from 'vue'
import { NModal, NText, NSpace, NButton, NAlert } from 'naive-ui'
import { acceptPrivacy } from '../api/ai'
import message from '../utils/message'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show', 'accepted', 'declined'])

const show = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

const handleAccept = async () => {
  try {
    await acceptPrivacy(true)
    emit('accepted')
    show.value = false
    message.success('已同意隐私声明')
  } catch (err) {
    message.error('操作失败：' + (err.message || '未知错误'))
  }
}

const handleDecline = () => {
  emit('declined')
  show.value = false
}
</script>

<style scoped>
.privacy-content {
  line-height: 1.6;
}
.privacy-content ul {
  padding-left: 20px;
  margin: 12px 0;
}
.privacy-content li {
  margin-bottom: 8px;
}
</style>
