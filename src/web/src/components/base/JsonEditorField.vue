<template>
  <div class="json-editor-field">
    <div class="json-editor-toolbar">
      <div class="json-editor-meta">
        <n-text depth="3">{{ summaryText }}</n-text>
        <n-text v-if="parseError" type="error" class="json-editor-error">{{ parseError }}</n-text>
      </div>
      <div class="json-editor-actions">
        <n-button size="tiny" quaternary :disabled="disabled" @click="formatJson">格式化</n-button>
        <n-button size="tiny" quaternary :disabled="disabled" @click="minifyJson">压缩</n-button>
        <n-button size="tiny" quaternary @click="showExpanded = true">放大编辑</n-button>
      </div>
    </div>

    <Codemirror
      v-model="draft"
      class="json-editor-codemirror"
      :style="inlineEditorStyle"
      :placeholder="placeholder"
      :disabled="disabled"
      :autofocus="false"
      :indent-with-tab="true"
      :tab-size="2"
      :extensions="editorExtensions"
      @change="handleChange"
    />

    <n-modal
      v-model:show="showExpanded"
      preset="card"
      title="编辑额外 JSON"
      class="json-editor-modal"
      :style="{ width: 'min(1180px, 94vw)' }"
      :content-style="{ maxHeight: '88vh', overflow: 'hidden' }"
    >
      <div class="json-editor-modal-body">
        <div class="json-editor-toolbar json-editor-toolbar--modal">
          <div class="json-editor-meta">
            <n-text depth="3">{{ summaryText }}</n-text>
            <n-text v-if="parseError" type="error" class="json-editor-error">{{ parseError }}</n-text>
          </div>
          <div class="json-editor-actions">
            <n-button size="small" quaternary :disabled="disabled" @click="formatJson">格式化</n-button>
            <n-button size="small" quaternary :disabled="disabled" @click="minifyJson">压缩</n-button>
          </div>
        </div>

        <Codemirror
          v-model="draft"
          class="json-editor-codemirror json-editor-codemirror--expanded"
          :style="expandedEditorStyle"
          :placeholder="placeholder"
          :disabled="disabled"
          :autofocus="true"
          :indent-with-tab="true"
          :tab-size="2"
          :extensions="editorExtensions"
          @change="handleChange"
        />
      </div>
      <template #footer>
        <div class="json-editor-footer">
          <n-button @click="showExpanded = false">完成</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NButton, NModal, NText } from 'naive-ui'
import { Codemirror } from 'vue-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'

const props = defineProps({
  value: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  autosize: {
    type: [Boolean, Object],
    default: () => ({ minRows: 5, maxRows: 10 })
  },
  inputProps: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:value'])

const draft = ref(props.value || '')
const showExpanded = ref(false)

watch(
  () => props.value,
  (value) => {
    const nextValue = value || ''
    if (nextValue !== draft.value) {
      draft.value = nextValue
    }
  }
)

const minRows = computed(() => {
  if (props.autosize && typeof props.autosize === 'object' && typeof props.autosize.minRows === 'number') {
    return props.autosize.minRows
  }
  return 5
})

const inlineEditorStyle = computed(() => ({
  height: `${Math.max(minRows.value * 24 + 28, 180)}px`
}))

const expandedEditorStyle = computed(() => ({
  height: '65vh'
}))

const parseResult = computed(() => {
  const text = draft.value.trim()
  if (!text) {
    return { valid: true, error: '', lineCount: 1 }
  }

  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        valid: false,
        error: 'JSON 必须是对象格式',
        lineCount: draft.value.split('\n').length
      }
    }
    return { valid: true, error: '', lineCount: draft.value.split('\n').length }
  } catch (error) {
    return {
      valid: false,
      error: `JSON 格式错误：${error.message}`,
      lineCount: draft.value.split('\n').length
    }
  }
})

const parseError = computed(() => parseResult.value.error)

const summaryText = computed(() => {
  const lineCount = parseResult.value.lineCount
  const charCount = draft.value.length
  const status = draft.value.trim()
    ? (parseResult.value.valid ? 'JSON 有效' : 'JSON 待修复')
    : '空内容'
  return `${status} · ${lineCount} 行 · ${charCount} 字符`
})

const editorExtensions = computed(() => [
  json(),
  oneDark,
  EditorView.lineWrapping,
  keymap.of([
    {
      key: 'Ctrl-Shift-f',
      run: () => {
        formatJson()
        return true
      }
    },
    {
      key: 'Cmd-Shift-f',
      run: () => {
        formatJson()
        return true
      }
    }
  ]),
  EditorView.theme({
    '&': {
      fontSize: '13px',
      borderRadius: '10px',
      border: '1px solid rgba(148, 163, 184, 0.32)',
      overflow: 'hidden'
    },
    '.cm-scroller': {
      fontFamily: "'SF Mono', Monaco, Consolas, 'Courier New', monospace",
      lineHeight: '1.65'
    },
    '.cm-content': {
      padding: '12px 0'
    },
    '.cm-gutters': {
      borderRight: '1px solid rgba(148, 163, 184, 0.18)',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      color: 'rgba(148, 163, 184, 0.82)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(59, 130, 246, 0.14)'
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(59, 130, 246, 0.10)'
    },
    '.cm-placeholder': {
      color: 'rgba(148, 163, 184, 0.72)'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '&.cm-focused': {
      borderColor: 'rgba(59, 130, 246, 0.55)',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.14)'
    }
  })
])

function emitValue(value) {
  draft.value = value
  emit('update:value', value)
}

function handleChange(value) {
  emitValue(value || '')
}

function parseCurrentJson() {
  const text = draft.value.trim()
  if (!text) {
    return {}
  }
  return JSON.parse(text)
}

function formatJson() {
  if (!draft.value.trim()) {
    emitValue('')
    return
  }

  try {
    emitValue(JSON.stringify(parseCurrentJson(), null, 2))
  } catch (error) {
    // 非法 JSON 保持原样，由界面提示修复
  }
}

function minifyJson() {
  if (!draft.value.trim()) {
    emitValue('')
    return
  }

  try {
    emitValue(JSON.stringify(parseCurrentJson()))
  } catch (error) {
    // 非法 JSON 保持原样，由界面提示修复
  }
}
</script>

<style scoped>
.json-editor-field {
  width: 100%;
}

.json-editor-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.json-editor-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.json-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.json-editor-error {
  word-break: break-word;
}

.json-editor-codemirror {
  width: 100%;
}

.json-editor-codemirror :deep(.cm-editor) {
  height: 100%;
}

.json-editor-codemirror :deep(.cm-scroller) {
  overflow: auto;
}

.json-editor-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.json-editor-codemirror--expanded {
  width: 100%;
}

.json-editor-footer {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .json-editor-toolbar,
  .json-editor-toolbar--modal {
    flex-direction: column;
    align-items: stretch;
  }

  .json-editor-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}
</style>
