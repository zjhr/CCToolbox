<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    title="上传技能"
    :bordered="false"
    :closable="true"
    style="width: 520px; max-width: 90vw;"
    role="dialog"
    aria-modal="true"
    aria-label="上传技能"
    @close="handleClose"
  >
    <div class="upload-body">
      <div
        v-if="!uploading"
        class="upload-actions"
        :class="{ dragging: isDragging }"
        @dragenter.capture.prevent="handleDragEnter"
        @dragover.capture.prevent="handleDragOver"
        @dragleave.capture.prevent="handleDragLeave"
        @drop.capture.prevent="handleDrop"
      >
        <n-upload
          accept=".zip"
          :show-file-list="false"
          :default-upload="false"
          :disabled="uploading"
          @change="handleUploadChange"
        >
          <n-button ref="zipButtonRef" type="primary">选择 ZIP 或文件夹</n-button>
        </n-upload>
        <div class="upload-hint">支持拖拽 ZIP 或文件夹，自动识别</div>
      </div>

      <div v-else class="upload-progress">
        <div class="progress-row">
          <div class="progress-label">上传进度</div>
          <n-progress
            type="line"
            :percentage="uploadProgress"
            :indicator-placement="'inside'"
            :height="10"
            :aria-valuenow="uploadProgress"
            :aria-valuemax="100"
            aria-label="上传进度"
          />
        </div>
        <div class="progress-row">
          <div class="progress-label">解压进度</div>
          <n-progress
            type="line"
            :percentage="extractProgress"
            :indicator-placement="'inside'"
            :height="10"
            :aria-valuenow="extractProgress"
            :aria-valuemax="100"
            aria-label="解压进度"
          />
        </div>
      </div>

      <n-alert
        v-if="errorMessage"
        type="error"
        :bordered="false"
        size="small"
        class="error-alert"
      >
        {{ errorMessage }}
      </n-alert>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button text @click="handleOpenCreate">创建自定义技能</n-button>
        <div class="footer-actions">
          <n-button @click="handleClose">取消</n-button>
          <n-button type="primary" :disabled="uploading" @click="handleConfirm">
            确定
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { NModal, NButton, NUpload, NProgress, NAlert } from 'naive-ui'
import { uploadSkill } from '../api/skills'
import message, { dialog } from '../utils/message'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible', 'uploaded', 'open-create'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const uploading = ref(false)
const uploadProgress = ref(0)
const extractProgress = ref(0)
const errorMessage = ref('')
const latestFiles = ref([])
const zipButtonRef = ref(null)
const isDragging = ref(false)
let extractTimer = null

function resetState() {
  uploading.value = false
  uploadProgress.value = 0
  extractProgress.value = 0
  errorMessage.value = ''
  latestFiles.value = []
  if (extractTimer) {
    clearInterval(extractTimer)
    extractTimer = null
  }
}

function startExtractProgress() {
  if (extractTimer) return
  extractProgress.value = Math.max(extractProgress.value, 10)
  extractTimer = setInterval(() => {
    if (extractProgress.value < 90) {
      extractProgress.value += 5
    }
  }, 400)
}

function stopExtractProgress() {
  if (extractTimer) {
    clearInterval(extractTimer)
    extractTimer = null
  }
}

function handleUploadProgress(event) {
  if (!event.total) return
  const percent = Math.round((event.loaded / event.total) * 100)
  uploadProgress.value = Math.min(100, percent)
  if (percent >= 100) {
    startExtractProgress()
  }
}

async function performUpload(files, force = false) {
  uploading.value = true
  uploadProgress.value = 0
  extractProgress.value = 0
  errorMessage.value = ''

  try {
    const result = await uploadSkill({
      files,
      force,
      onUploadProgress: handleUploadProgress
    })

    if (result.success) {
      uploadProgress.value = 100
      extractProgress.value = 100
      message.success('技能上传成功')
      emit('uploaded', result)
      setTimeout(() => {
        handleClose()
      }, 1000)
      return
    }

    if (result.code === 'VERSION_SAME' && !force) {
      uploading.value = false
      stopExtractProgress()
      dialog.warning({
        title: '版本相同',
        content: '版本相同，是否强制覆盖？',
        positiveText: '强制覆盖',
        negativeText: '取消',
        onPositiveClick: () => performUpload(files, true)
      })
      return
    }

    errorMessage.value = result.error || result.message || '上传失败'
  } catch (err) {
    errorMessage.value = err.response?.data?.message || err.message || '上传失败'
  } finally {
    uploading.value = false
    stopExtractProgress()
  }
}

function handleUploadChange({ file, fileList }) {
  if (uploading.value) return
  const files = (fileList || [])
    .map(item => item.file)
    .filter(Boolean)
  if (files.length === 0 && file?.file) {
    files.push(file.file)
  }
  if (files.length === 0) return
  latestFiles.value = files
  performUpload(latestFiles.value)
}

function handleDragEnter() {
  if (uploading.value) return
  isDragging.value = true
}

function handleDragOver() {
  if (uploading.value) return
  isDragging.value = true
}

function handleDragLeave(event) {
  if (uploading.value) return
  if (event.currentTarget?.contains?.(event.relatedTarget)) return
  isDragging.value = false
}

async function handleDrop(event) {
  if (uploading.value) return
  isDragging.value = false
  const files = await collectFilesFromDrop(event)
  if (files.length === 0) return
  latestFiles.value = files
  performUpload(latestFiles.value)
}

async function collectFilesFromDrop(event) {
  const items = Array.from(event.dataTransfer?.items || [])
  if (items.some(item => typeof item.getAsFileSystemHandle === 'function')) {
    let files = []
    for (const item of items) {
      if (typeof item.getAsFileSystemHandle !== 'function') continue
      try {
        const handle = await item.getAsFileSystemHandle()
        if (!handle) continue
        const collected = await collectFilesFromHandle(handle, '')
        files = files.concat(collected)
      } catch (err) {
        continue
      }
    }
    if (files.length > 0) {
      return files
    }
  }

  const entries = items
    .map(item => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean)

  if (entries.length === 0) {
    return Array.from(event.dataTransfer?.files || []).map((file) => {
      if (file && !file.__relativePath && file.webkitRelativePath) {
        file.__relativePath = file.webkitRelativePath
      }
      return file
    })
  }

  let files = []
  for (const entry of entries) {
    const collected = await collectFilesFromEntry(entry, '')
    files = files.concat(collected)
  }
  return files
}

async function collectFilesFromHandle(handle, parentPath) {
  if (handle.kind === 'file') {
    const file = await handle.getFile()
    const fileName = parentPath ? `${parentPath}/${file.name}` : file.name
    file.__relativePath = fileName
    return [file]
  }
  if (handle.kind !== 'directory') return []
  const currentPath = parentPath ? `${parentPath}/${handle.name}` : handle.name
  let files = []
  for await (const entry of handle.values()) {
    const collected = await collectFilesFromHandle(entry, currentPath)
    files = files.concat(collected)
  }
  return files
}

async function collectFilesFromEntry(entry, parentPath) {
  if (entry.isFile) {
    const file = await readEntryFile(entry, parentPath)
    return file ? [file] : []
  }
  if (!entry.isDirectory) return []

  const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
  const reader = entry.createReader()
  const entries = []
  let batch = await readEntryBatch(reader)
  while (batch.length > 0) {
    entries.push(...batch)
    batch = await readEntryBatch(reader)
  }

  let files = []
  for (const child of entries) {
    const collected = await collectFilesFromEntry(child, currentPath)
    files = files.concat(collected)
  }
  return files
}

function readEntryBatch(reader) {
  return new Promise(resolve => {
    reader.readEntries(
      (result) => resolve(Array.from(result || [])),
      () => resolve([])
    )
  })
}

function readEntryFile(entry, parentPath) {
  return new Promise(resolve => {
    entry.file(
      (file) => {
        const fileName = parentPath ? `${parentPath}/${file.name}` : file.name
        file.__relativePath = fileName
        resolve(file)
      },
      () => resolve(null)
    )
  })
}

function handleConfirm() {
  if (!uploading.value) {
    handleClose()
  }
}

function handleClose() {
  resetState()
  emit('update:visible', false)
}

function handleOpenCreate() {
  emit('open-create')
}

watch(() => props.visible, (val) => {
  if (val) {
    nextTick(() => {
      if (zipButtonRef.value?.focus) {
        zipButtonRef.value.focus()
      } else if (zipButtonRef.value?.$el?.focus) {
        zipButtonRef.value.$el.focus()
      }
    })
  } else {
    resetState()
  }
})
</script>

<style scoped>
.upload-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: nowrap;
  padding: 12px;
  border: 1px dashed var(--border-primary);
  border-radius: 8px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.upload-actions.dragging {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.08);
}

.upload-actions :deep(.n-button) {
  min-width: 160px;
}

.upload-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.upload-progress {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.error-alert {
  margin-top: 4px;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

@media (max-width: 480px) {
  .upload-actions {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .upload-actions :deep(.n-button) {
    min-height: 44px;
  }

  .upload-hint {
    white-space: normal;
  }
}
</style>
