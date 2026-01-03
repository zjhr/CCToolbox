import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AliasModal from './AliasModal.vue'
import {
  generateAlias,
  getSessionMetadata,
  setSessionMetadata,
  deleteSessionMetadata,
  getPresetTags
} from '../api/ai'

vi.mock('../api/ai', () => ({
  generateAlias: vi.fn(),
  getSessionMetadata: vi.fn(),
  setSessionMetadata: vi.fn(),
  deleteSessionMetadata: vi.fn(),
  getPresetTags: vi.fn()
}))

vi.mock('../utils/message', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  }
}))

const flushPromises = () => new Promise(resolve => setTimeout(resolve))

const stubs = {
  'n-modal': { template: '<div><slot /><slot name="footer" /></div>' },
  'n-form': { template: '<form><slot /></form>' },
  'n-form-item': { template: '<div><slot /></div>' },
  'n-input': { template: '<input />' },
  'n-select': { template: '<select></select>' },
  'n-space': { template: '<div><slot /></div>' },
  'n-button': { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' }
}

describe('AliasModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getSessionMetadata.mockResolvedValue({ success: false })
    getPresetTags.mockResolvedValue({ success: true, tags: [] })
    generateAlias.mockResolvedValue({ success: true, data: { title: '', tags: [] } })
    setSessionMetadata.mockResolvedValue({ success: true })
    deleteSessionMetadata.mockResolvedValue({ success: true })
  })

  it('打开时加载会话元数据与预设标签', async () => {
    getSessionMetadata.mockResolvedValue({
      success: true,
      data: { title: '自动标题', tags: ['feature'] }
    })
    getPresetTags.mockResolvedValue({ success: true, tags: ['feature', 'bug'] })

    const wrapper = mount(AliasModal, {
      props: {
        visible: false,
        session: { sessionId: 's-1', alias: '默认标题' },
        projectName: 'demo-project'
      },
      global: { stubs }
    })

    await wrapper.setProps({ visible: true })
    await nextTick()
    await flushPromises()

    expect(wrapper.vm.metadata.title).toBe('自动标题')
    expect(wrapper.vm.metadata.tags).toEqual(['feature'])
    const optionValues = wrapper.vm.presetTagsOptions.map(option => option.value)
    expect(optionValues).toContain('feature')
    expect(optionValues).toContain('bug')
  })

  it('点击自动生成会更新标题与标签', async () => {
    generateAlias.mockResolvedValue({
      success: true,
      data: { title: '生成标题', tags: ['ai'] }
    })

    const wrapper = mount(AliasModal, {
      props: {
        visible: true,
        session: { sessionId: 's-2', alias: '旧标题' },
        projectName: 'demo-project'
      },
      global: { stubs }
    })

    await flushPromises()
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await flushPromises()

    expect(generateAlias).toHaveBeenCalledWith({
      projectName: 'demo-project',
      sessionId: 's-2'
    })
    expect(wrapper.vm.metadata.title).toBe('生成标题')
    expect(wrapper.vm.metadata.tags).toEqual(['ai'])
  })

  it('保存时会提交元数据并关闭弹窗', async () => {
    const wrapper = mount(AliasModal, {
      props: {
        visible: true,
        session: { sessionId: 's-3', alias: '' },
        projectName: 'demo-project'
      },
      global: { stubs }
    })

    wrapper.vm.metadata.title = '保存标题'
    wrapper.vm.metadata.tags = ['feature']

    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    await flushPromises()

    expect(setSessionMetadata).toHaveBeenCalledWith('s-3', {
      title: '保存标题',
      tags: ['feature']
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
  })
})
