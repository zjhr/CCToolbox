import { defineComponent, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BaseChannelPanel from './BaseChannelPanel.vue'
import channelPanelFactories from './channelPanelFactories'

const createFormData = (overrides = {}) => ({
  channelId: 'saved-claude-1',
  presetId: 'official',
  name: '自定义渠道',
  baseUrl: 'https://old-base.example.com',
  apiKey: 'sk-live-123456',
  websiteUrl: 'https://old-site.example.com',
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
  enable1M: false,
  ...overrides
})

let mockedState: any
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

const NModalStub = defineComponent({
  template: '<div class="n-modal-stub"><slot /><slot name="footer" /></div>'
})

const NFormStub = defineComponent({
  template: '<form><slot /></form>'
})

const NFormItemStub = defineComponent({
  props: { label: { type: String, default: '' } },
  template: '<div class="n-form-item-stub" :data-label="label"><slot /></div>'
})

const NInputStub = defineComponent({
  props: {
    value: { type: [String, Number], default: '' },
    type: { type: String, default: 'text' },
    placeholder: { type: String, default: '' }
  },
  emits: ['update:value'],
  template:
    '<input :value="value" :type="type" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)" />'
})

function mountPanel() {
  return mount(BaseChannelPanel, {
    props: { type: 'claude' },
    global: {
      stubs: {
        draggable: true,
        ChannelCard: true,
        'n-modal': NModalStub,
        'n-form': NFormStub,
        'n-form-item': NFormItemStub,
        'n-input': NInputStub,
        'n-switch': true,
        'n-input-number': true,
        'n-button': true,
        'n-empty': true,
        'n-spin': true,
        'n-icon': true,
        'n-text': true,
        teleport: true
      }
    }
  })
}

async function switchPreset(presetId: string) {
  const factory = channelPanelFactories.claude()
  mockedState.formData = factory.onPresetChange(presetId, mockedState.formData)
  await nextTick()
}

describe('BaseChannelPanel - 预设切换原值提示（Red）', () => {
  beforeEach(() => {
    mockedState = reactive({
      channels: [],
      loading: false,
      currentChannel: null,
      currentChannelId: null,
      configWarning: null,
      collapsed: {},
      showDialog: true,
      editingChannel: {
        id: 'saved-claude-1',
        name: '自定义渠道',
        baseUrl: 'https://old-base.example.com',
        websiteUrl: 'https://old-site.example.com'
      },
      formData: createFormData()
    })
  })

  it('有值时，切换预设后应显示 Base URL 与官网链接的原值提示', async () => {
    const wrapper = mountPanel()
    await nextTick()

    await switchPreset('zhipu')

    expect(wrapper.text()).toContain('原已保存 Base URL：https://old-base.example.com')
    expect(wrapper.text()).toContain('原已保存官网：https://old-site.example.com')

    const formItems = wrapper.findAll('.n-form-item')
    const baseUrlField = formItems.find(item => item.text().includes('接口地址'))
    const websiteField = formItems.find(item => item.text().includes('官网链接'))

    expect(baseUrlField).toBeDefined()
    expect(websiteField).toBeDefined()

    const baseUrlFieldContainer = baseUrlField!.get('.field-with-hint')
    const websiteFieldContainer = websiteField!.get('.field-with-hint')
    expect(baseUrlFieldContainer.find('input').exists()).toBe(true)
    expect(websiteFieldContainer.find('input').exists()).toBe(true)
    expect(baseUrlFieldContainer.find('.original-value-hint').exists()).toBe(true)
    expect(websiteFieldContainer.find('.original-value-hint').exists()).toBe(true)
  })

  it('无值时，切换预设后不应显示原已保存值提示', async () => {
    mockedState.editingChannel.baseUrl = ''
    mockedState.editingChannel.websiteUrl = ''
    mockedState.formData = createFormData({ baseUrl: '', websiteUrl: '' })

    const wrapper = mountPanel()
    await nextTick()

    await switchPreset('zhipu')

    expect(wrapper.text()).not.toContain('原已保存 Base URL：')
    expect(wrapper.text()).not.toContain('原已保存官网：')
  })

  it('原值提示应为只读提示，输入框实际值应切换到预设值', async () => {
    const wrapper = mountPanel()
    await nextTick()

    await switchPreset('zhipu')

    expect(wrapper.text()).toContain('原已保存 Base URL：https://old-base.example.com')
    expect(wrapper.text()).toContain('原已保存官网：https://old-site.example.com')

    const baseUrlInput = wrapper.get('input[placeholder="https://api.example.com"]')
    const websiteInput = wrapper.get('input[placeholder="https://（选填）"]')

    expect(baseUrlInput.element.value).toBe('https://open.bigmodel.cn/api/anthropic')
    expect(websiteInput.element.value).toBe('https://open.bigmodel.cn')
  })
})
