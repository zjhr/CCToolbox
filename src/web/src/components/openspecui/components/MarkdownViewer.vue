<template>
  <div class="markdown-viewer" :class="viewerClass">
    <div v-if="!content" class="viewer-empty">
      <n-empty :description="emptyText" />
    </div>
    <div v-else class="viewer-body">
      <div class="preview-pane" :id="scrollContainerId">
        <MdPreview :key="activeEditorId" :editor-id="activeEditorId" :model-value="content" />
      </div>
      <div ref="catalogRef" class="catalog-pane">
        <MdCatalog
          :key="`catalog-${activeEditorId}`"
          :editor-id="activeEditorId"
          :scroll-element="scrollElement"
          :scroll-element-offset-top="scrollElementOffsetTop"
          :offset-top="catalogOffsetTop"
          :on-active="handleCatalogActive"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, watch } from 'vue'
import { NEmpty } from 'naive-ui'
import { MdPreview, MdCatalog } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  editorId: {
    type: String,
    default: ''
  },
  emptyText: {
    type: String,
    default: '暂无内容'
  },
  variant: {
    type: String,
    default: ''
  }
})

const internalId = `openspec-${Math.random().toString(36).slice(2, 8)}`
const activeEditorId = computed(() => props.editorId || internalId)
const viewerClass = computed(() => {
  if (!props.variant) return ''
  return `markdown-viewer--${props.variant}`
})
const scrollContainerId = computed(() => `${activeEditorId.value}-scroll-container`)
const scrollElement = computed(() => `#${scrollContainerId.value}`)
const catalogOffsetTop = 12
const scrollElementOffsetTop = 0
const catalogRef = ref(null)

function handleCatalogActive(_item, el) {
  const container = catalogRef.value?.querySelector('.md-editor-catalog')
  if (!container || !el) return
  const viewTop = container.scrollTop
  const viewBottom = viewTop + container.clientHeight
  const elTop = el.offsetTop
  const elBottom = elTop + el.offsetHeight
  if (elTop < viewTop || elBottom > viewBottom) {
    const nextTop = Math.max(elTop - catalogOffsetTop, 0)
    container.scrollTo({ top: nextTop, behavior: 'smooth' })
  }
}

function isRequirementHeading(node) {
  if (!node || !node.tagName) return false
  const tag = node.tagName.toLowerCase()
  if (tag !== 'h3' && tag !== 'h4') return false
  const text = node.textContent || ''
  return /Requirement:/i.test(text) || /要求/.test(text)
}

function resetRequirementCards(preview) {
  const cards = Array.from(preview.querySelectorAll('.spec-requirement-card'))
  cards.forEach((card) => {
    while (card.firstChild) {
      preview.insertBefore(card.firstChild, card)
    }
    card.remove()
  })
}

function applyRequirementCards() {
  if (props.variant !== 'spec') return
  const container = document.getElementById(scrollContainerId.value)
  const preview = container?.querySelector('.md-editor-preview')
  if (!preview) return
  resetRequirementCards(preview)
  const children = Array.from(preview.children)
  let currentCard = null
  children.forEach((child) => {
    if (isRequirementHeading(child)) {
      currentCard = document.createElement('div')
      currentCard.className = 'spec-requirement-card'
      preview.insertBefore(currentCard, child)
      currentCard.appendChild(child)
      return
    }
    if (currentCard) {
      currentCard.appendChild(child)
    }
  })
}

onMounted(() => {
  nextTick(() => applyRequirementCards())
})

watch(
  () => [props.content, props.variant, activeEditorId.value],
  () => {
    nextTick(() => applyRequirementCards())
  }
)
</script>

<style scoped>
.markdown-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  flex: 1;
}

.viewer-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 12px;
  flex: 1;
  height: 100%;
  min-height: 0;
}

.preview-pane {
  height: 100%;
  min-height: 0;
  overflow: auto;
  position: relative;
  padding: 0;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: #fff;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}

.preview-pane :deep(.md-editor-preview),
.preview-pane :deep(.md-editor-previewOnly) {
  --md-theme-code-block-bg-color: #f7e7d1;
  --md-theme-code-before-bg-color: #f3d7b5;
  --md-theme-code-block-color: #5a3b1f;
  --md-theme-code-inline-color: #7a4a1f;
  --md-theme-code-inline-bg-color: #fdeed7;
}

.preview-pane :deep(.md-editor),
.preview-pane :deep(.md-editor-previewOnly) {
  height: auto;
  overflow: visible;
}

.preview-pane :deep(.md-editor-preview-wrapper) {
  height: auto;
  overflow: visible;
}

.preview-pane :deep(.md-editor-preview) {
  padding: 12px;
}

.preview-pane :deep(.md-editor-preview pre) {
  background: linear-gradient(135deg, #fbf3e6 0%, #f7e7d1 100%);
  border: 1px solid #e4c29f;
  border-left: 4px solid #d6863c;
  border-radius: 0 0 10px 10px;
  color: #5a3b1f;
  box-shadow: 0 1px 0 rgba(120, 72, 24, 0.08);
  overflow-x: auto;
  overflow-y: hidden;
  white-space: pre;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
}

.preview-pane :deep(.md-editor-preview .md-editor-code pre) {
  display: flex;
  align-items: flex-start;
}

.preview-pane :deep(.md-editor-preview pre code) {
  background: transparent;
  color: inherit;
  white-space: pre;
  word-break: normal;
  overflow-x: auto;
  overflow-y: hidden;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  padding-top: 0;
  padding-bottom: 0;
}

.preview-pane :deep(.md-editor-preview .md-editor-code pre code .md-editor-code-block) {
  overflow-x: auto;
  overflow-y: hidden;
  white-space: pre;
}

.preview-pane :deep(.md-editor-preview code) {
  background: #fdeed7;
  border: 1px solid #e6c7a4;
  border-radius: 4px;
  color: #7a4a1f;
  padding: 1px 4px;
}

.preview-pane :deep(.md-editor-preview pre code) {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
}

.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-head),
.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-header),
.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-toolbar) {
  background: linear-gradient(135deg, #f6e3c7 0%, #f3d7b5 100%) !important;
  border-bottom: 1px solid #e4c29f;
  color: #7a4a1f;
}

.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-head .md-editor-code-flag ul.md-editor-codetab-label) {
  background: transparent;
}

.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-head) {
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
}

.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-flag) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
}

.preview-pane :deep(.md-editor-preview .md-editor-code pre code > span[rn-wrapper]) {
  top: 0 !important;
  margin-top: 0 !important;
  padding-top: 0 !important;
}

.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-head *),
.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-header *),
.preview-pane :deep(.md-editor-preview .md-editor-code .md-editor-code-toolbar *) {
  color: inherit;
}

.markdown-viewer--spec :deep(.md-editor-preview h2) {
  margin-top: 20px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e9d2b6;
  color: #7a4a1f;
}

.markdown-viewer--spec :deep(.md-editor-preview h3) {
  margin-top: 18px;
  padding: 6px 10px;
  background: #fff4e6;
  border-left: 4px solid #d6863c;
  border-radius: 6px;
  color: #7a4a1f;
}

.markdown-viewer--spec :deep(.md-editor-preview h4) {
  margin-top: 12px;
  padding-left: 10px;
  border-left: 2px dashed #e4c29f;
  color: #8a5a2f;
}

.markdown-viewer--spec :deep(.spec-requirement-card) {
  margin: 16px 0;
  padding: 12px 12px 10px;
  background: #fff8ef;
  border: 1px solid #f0d9bb;
  border-left: 4px solid #d6863c;
  border-radius: 10px;
  box-shadow: inset 0 1px 0 rgba(214, 134, 60, 0.12);
}

.markdown-viewer--spec :deep(.spec-requirement-card > h3) {
  margin: 0 0 8px;
  padding: 0 0 6px;
  background: transparent;
  border-left: none;
  border-radius: 0;
  border-bottom: 1px dashed #e4c29f;
}

.markdown-viewer--spec :deep(.spec-requirement-card > h4) {
  margin-top: 10px;
  padding: 4px 8px;
  background: #fff1dc;
  border-left: none;
  border-radius: 6px;
  color: #8a5a2f;
  display: inline-block;
}

.preview-pane::-webkit-scrollbar {
  width: 8px;
}

.preview-pane::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.preview-pane::-webkit-scrollbar-track {
  background-color: transparent;
}

.catalog-pane {
  height: 100%;
  min-height: 0;
  position: sticky;
  top: 0;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-primary);
}

.catalog-pane :deep(.md-editor-catalog) {
  height: 100%;
  overflow: auto;
  position: relative;
  padding: 12px 12px 16px;
  box-sizing: border-box;
}

.catalog-pane :deep(.md-editor-catalog-indicator) {
  transform: translateY(2px);
}

.viewer-empty {
  padding: 12px 0;
}

/* 修复代码块行号和文本对齐问题 */
.preview-pane :deep(.md-editor-code-block) {
  display: flex;
  align-items: flex-start;
}

.preview-pane :deep(.md-editor-code-block-row) {
  display: flex;
  align-items: flex-start;
  line-height: 1.6;
}

.preview-pane :deep(.md-editor-code-block-row-line) {
  line-height: 1.6;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  margin: 0 !important;
  min-width: 2.5em;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-right: 1em;
  text-align: right;
  user-select: none;
  flex-shrink: 0;
  align-self: flex-start;
}

.preview-pane :deep(.md-editor-code-block-row-code) {
  line-height: 1.6;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  margin: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  flex: 1;
  white-space: pre;
}

.preview-pane :deep(.md-editor-preview .md-editor-code-flag),
.preview-pane :deep(.md-editor-preview .md-editor-code-flag li) {
  margin-top: 0 !important;
  padding-top: 0 !important;
}
</style>
