<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="title"
    :bordered="false"
    :closable="true"
    style="width: 400px; max-width: 90vw;"
    @close="handleClose"
  >
    <div class="platform-selection-content">
      <p class="description">{{ description }}</p>
      
      <n-checkbox-group v-model:value="selectedPlatforms">
        <n-space vertical>
          <div 
            v-for="platform in displayPlatforms" 
            :key="platform.id"
            class="platform-item"
            :class="{ disabled: mode === 'uninstall' && !platform.installed }"
          >
            <n-checkbox 
              :value="platform.id" 
              :disabled="mode === 'uninstall' && !platform.installed"
            >
              <div class="platform-label">
                <span 
                  class="platform-dot" 
                  :style="{ backgroundColor: platform.color }"
                ></span>
                <span class="platform-name">{{ platform.name }}</span>
                <n-tag 
                  v-if="platform.installed" 
                  size="small" 
                  round 
                  :bordered="false"
                  type="success"
                  class="status-tag"
                >
                  已安装
                </n-tag>
                <n-tag 
                  v-else-if="platform.exists" 
                  size="small" 
                  round 
                  :bordered="false"
                  class="status-tag"
                >
                  目录已存在
                </n-tag>
              </div>
            </n-checkbox>
          </div>
        </n-space>
      </n-checkbox-group>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="handleClose">取消</n-button>
        <n-button 
          :type="mode === 'uninstall' ? 'error' : 'primary'" 
          :disabled="!canConfirm" 
          @click="handleConfirm"
        >
          {{ confirmText }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NCheckboxGroup, NCheckbox, NButton, NSpace, NTag } from 'naive-ui'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    validator: (value) => ['install', 'uninstall', 'upload'].includes(value),
    default: 'install'
  },
  skill: {
    type: Object,
    default: () => ({})
  },
  platforms: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'confirm'])

const visible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const selectedPlatforms = ref([])

const isInstallMode = computed(() => props.mode === 'install' || props.mode === 'upload')

const title = computed(() => {
  return isInstallMode.value ? '安装到平台' : '从平台卸载'
})

const description = computed(() => {
  return isInstallMode.value
    ? '选择要安装此技能的平台：' 
    : '选择要卸载此技能的平台：'
})

const confirmText = computed(() => {
  return isInstallMode.value ? '确认安装' : '确认卸载'
})

const displayPlatforms = computed(() => {
  return props.platforms.map(p => ({
    ...p,
    installed: props.skill?.installedPlatforms?.includes(p.id) || false
  }))
})

const canConfirm = computed(() => selectedPlatforms.value.length > 0)

function handleClose() {
  emit('update:visible', false)
}

function handleConfirm() {
  if (canConfirm.value) {
    emit('confirm', [...selectedPlatforms.value])
  }
}

// 初始化选中状态
watch(() => [props.visible, props.mode], ([newVisible, newMode]) => {
  if (newVisible) {
    if (newMode === 'upload') {
      selectedPlatforms.value = props.platforms.map(p => p.id)
    } else if (newMode === 'install') {
      // 安装模式：默认勾选已存在目录的平台
      selectedPlatforms.value = props.platforms
        .filter(p => p.exists)
        .map(p => p.id)
    } else {
      // 卸载模式：默认勾选已安装的平台
      selectedPlatforms.value = props.skill?.installedPlatforms || []
    }
  } else {
    selectedPlatforms.value = []
  }
}, { immediate: true })

</script>

<style scoped>
.platform-selection-content {
  padding: 8px 0;
}

.description {
  margin-bottom: 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

.platform-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background-color 0.2s;
  width: 100%;
}

.platform-item:hover:not(.disabled) {
  background-color: var(--bg-secondary);
}

.platform-item.disabled {
  opacity: 0.6;
}

.platform-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.platform-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.platform-name {
  font-weight: 500;
  color: var(--text-primary);
}

.status-tag {
  margin-left: auto;
  font-size: 11px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
