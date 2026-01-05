<template>
  <n-dropdown
    trigger="click"
    :options="dropdownOptions"
    @select="handleSelect"
  >
    <n-button
      type="primary"
      size="small"
      :loading="detecting"
      @click.stop="handleOpen"
    >
      <template #icon>
        <n-icon><TerminalOutline /></n-icon>
      </template>
      启动终端
    </n-button>
  </n-dropdown>
</template>

<script setup>
import { computed, h } from 'vue'
import { NButton, NDropdown, NIcon } from 'naive-ui'
import { TerminalOutline, CopyOutline } from '@vicons/ionicons5'
import { useTerminalLauncher } from '../composables/useTerminalLauncher'

const props = defineProps({
  projectName: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  channel: {
    type: String,
    default: 'claude'
  }
})

const emit = defineEmits(['launched', 'copied'])

const { terminals, detecting, detect, copy, launch } = useTerminalLauncher()

const baseTerminals = [
  { id: 'terminal', name: 'Terminal' },
  { id: 'iterm2', name: 'iTerm2' },
  { id: 'warp', name: 'Warp' },
  { id: 'vscode', name: 'VSCode' }
]

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const terminalOptions = computed(() => {
  const availableMap = new Map(terminals.value.map(terminal => [terminal.id, terminal]))
  const baseOptions = baseTerminals.map(terminal => {
    const available = availableMap.get(terminal.id)
    return {
      id: terminal.id,
      name: available?.name || terminal.name,
      available: Boolean(available)
    }
  })

  const extraOptions = terminals.value
    .filter(terminal => !baseTerminals.some(base => base.id === terminal.id))
    .map(terminal => ({
      id: terminal.id,
      name: terminal.name,
      available: Boolean(terminal.available)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  return [...baseOptions, ...extraOptions]
})

const dropdownOptions = computed(() => ([
  {
    label: '复制命令',
    key: 'copy',
    icon: renderIcon(CopyOutline)
  },
  { type: 'divider', key: 'divider' },
  ...terminalOptions.value.map(terminal => ({
    label: terminal.name,
    key: `terminal:${terminal.id}`,
    disabled: !terminal.available,
    icon: renderIcon(TerminalOutline)
  }))
]))

async function handleOpen() {
  if (detecting.value) return
  await detect()
}

async function handleSelect(key) {
  if (key === 'copy') {
    const copied = await copy(props.projectName, props.sessionId, props.channel)
    if (copied) {
      emit('copied')
    }
    return
  }
  if (key.startsWith('terminal:')) {
    const terminalId = key.replace('terminal:', '')
    const launched = await launch(props.projectName, props.sessionId, props.channel, terminalId)
    if (launched) {
      emit('launched')
    }
  }
}
</script>
