import { reactive, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { NSelect } from 'naive-ui'
import BaseChannelPanel from './BaseChannelPanel.vue'
import * as channelApi from '../../api/channels'

const FULL_API_KEY = 'sk-live-1234567890abcdef'
const MASKED_API_KEY = 'sk-liv***************'

const mockedState = reactive({
  channels: [],
  loading: false,
  currentChannel: null,
  currentChannelId: null,
  configWarning: null,
  collapsed: {},
  showDialog: true,
  editingChannel: {
    id: 'claude-edit-1',
    name: 'Claude 渠道',
    apiKey: MASKED_API_KEY,
    rawApiKey: FULL_API_KEY
  },
  formData: {
    presetId: 'official',
    name: 'Claude 渠道',
    baseUrl: 'https://api.anthropic.com',
    apiKey: MASKED_API_KEY,
    websiteUrl: 'https://www.anthropic.com',
    modelConfig: {
      model: '',
      haikuModel: '',
      sonnetModel: '',
      opusModel: ''
    },
    proxyUrl: '',
    maxConcurrency: null,
    weight: 1,
    enabled: true,
    enable1M: false
  }
})

const mockedValidation = reactive({})

const mockedActions = {
  loadChannels: vi.fn(),
  openAddDialog: vi.fn(),
  closeDialog: vi.fn(),
  toggleCollapse: vi.fn(),
  toggleAllCollapse: vi.fn(),
  handleEdit: vi.fn(),
  handleSave: vi.fn(),
  handleDelete: vi.fn(),
  handleToggleEnabled: vi.fn(),
  handleApplyToSettings: vi.fn(),
  handleClearConfig: vi.fn(),
  handleResetHealth: vi.fn(),
  handleDragEnd: vi.fn()
}

vi.mock('../../composables/useChannelManager', () => ({
  default: () => ({
    state: mockedState,
    validation: mockedValidation,
    actions: mockedActions
  })
}))

vi.mock('../../composables/useChannelScheduler', () => ({
  useChannelScheduler: () => ({
    getChannelInflight: () => 0
  })
}))

vi.mock('../../api/channels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/channels')>()
  return {
    ...actual,
    updateReasoningEffort: vi.fn(() => Promise.resolve({ success: true })),
    getReasoningEffort: vi.fn(() => Promise.resolve({ effort: 'high' }))
  }
})

describe('BaseChannelPanel API Key 显隐（Red）', () => {
  it('应当在点击眼镜后显示完整 API Key，再次点击恢复掩码显示', async () => {
    const wrapper = mount(BaseChannelPanel, {
      props: { type: 'claude' },
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true
        }
      }
    })

    await nextTick()

    const getApiKeyInput = () =>
      wrapper.findAll('input').find(item => item.element.value.includes('sk-liv'))

    const inputBeforeToggle = getApiKeyInput()
    expect(inputBeforeToggle).toBeDefined()
    expect(inputBeforeToggle!.element.value).toBe(MASKED_API_KEY)

    const clickEyeToggle = async () => {
      const eyeToggle = wrapper.find('.n-input__eye')
      expect(eyeToggle.exists()).toBe(true)
      const eyeInnerTarget = wrapper.find('.n-input__eye svg path')
      if (eyeInnerTarget.exists()) {
        await eyeInnerTarget.trigger('click')
        return
      }
      await eyeToggle.trigger('click')
    }

    await clickEyeToggle()
    await nextTick()

    const inputAfterFirstClick = getApiKeyInput()
    expect(inputAfterFirstClick).toBeDefined()
    expect(inputAfterFirstClick!.element.value).toBe(FULL_API_KEY)

    await clickEyeToggle()
    await nextTick()

    const inputAfterSecondClick = getApiKeyInput()
    expect(inputAfterSecondClick).toBeDefined()
    expect(inputAfterSecondClick!.element.value).toBe(MASKED_API_KEY)

    const switchItem = wrapper.findAll('.n-form-item').find(item => item.text().includes('1M 上下文'))
    expect(switchItem).toBeDefined()
    expect(switchItem!.classes()).toContain('form-item-switch')

    wrapper.unmount()
  })
})

describe('BaseChannelPanel 字段组件解析（Red）', () => {
  function mountPanel() {
    return mount(BaseChannelPanel, {
      props: { type: 'claude' },
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true
        }
      }
    })
  }

  it('GIVEN type=select WHEN 调用 resolveFieldComponent THEN 返回 NSelect', async () => {
    const wrapper = mountPanel()
    try {
      await nextTick()

      const setupState = wrapper.vm.$.setupState as {
        resolveFieldComponent: (type: string) => unknown
      }
      const fieldComponent = setupState.resolveFieldComponent('select')

      expect(fieldComponent).toBe(NSelect)
    } finally {
      wrapper.unmount()
    }
  })

  it('GIVEN 字段包含 options WHEN 调用 buildFieldProps THEN 正确透传 options', async () => {
    const wrapper = mountPanel()
    try {
      await nextTick()

      const options = [
        { label: '开启(1)', value: '1' },
        { label: '关闭(0)', value: '0' },
        { label: '自动(auto)', value: 'auto' }
      ]
      const setupState = wrapper.vm.$.setupState as {
        buildFieldProps: (field: {
          type: string
          placeholder: string
          options: Array<{ label: string, value: string }>
        }) => Record<string, unknown>
      }
      const fieldProps = setupState.buildFieldProps({
        type: 'select',
        placeholder: '请选择',
        options
      })

      expect(fieldProps.options).toEqual(options)
    } finally {
      wrapper.unmount()
    }
  })

  it('GIVEN type 非 select WHEN 调用 resolveFieldComponent THEN 返回非 NSelect', async () => {
    const wrapper = mountPanel()
    try {
      await nextTick()

      const setupState = wrapper.vm.$.setupState as {
        resolveFieldComponent: (type: string) => unknown
      }
      const fieldComponent = setupState.resolveFieldComponent('text')

      expect(fieldComponent).not.toBe(NSelect)
    } finally {
      wrapper.unmount()
    }
  })
})

describe('BaseChannelPanel Codex 推理强度同步（Red）', () => {
  it('refresh 应重新读取 config.toml 对应的推理强度', async () => {
    vi.mocked(channelApi.getReasoningEffort)
      .mockResolvedValueOnce({ effort: 'medium' })
      .mockResolvedValueOnce({ effort: 'low' })

    const wrapper = mount(BaseChannelPanel, {
      props: { type: 'codex' },
      attachTo: document.body,
      global: {
        stubs: {
          teleport: true
        }
      }
    })

    try {
      await flushPromises()

      const exposed = wrapper.vm.$.exposed as {
        refresh: () => Promise<void>
        getReasoningEffort: () => string
      }

      expect(exposed.getReasoningEffort()).toBe('medium')

      await exposed.refresh()
      await flushPromises()

      expect(mockedActions.loadChannels).toHaveBeenCalled()
      expect(vi.mocked(channelApi.getReasoningEffort)).toHaveBeenCalledTimes(2)
      expect(exposed.getReasoningEffort()).toBe('low')
    } finally {
      wrapper.unmount()
    }
  })
})
