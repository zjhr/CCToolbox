import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SkillCreateModal from './SkillCreateModal.vue'
import { getPlatforms, createCustomSkill } from '../api/skills'

vi.mock('../api/skills', () => ({
  getPlatforms: vi.fn(),
  createCustomSkill: vi.fn()
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
  'n-checkbox-group': { template: '<div><slot /></div>' },
  'n-checkbox': { template: '<input type="checkbox" />' },
  'n-space': { template: '<div><slot /></div>' },
  'n-tabs': { template: '<div><slot /></div>' },
  'n-tab-pane': { template: '<div><slot /></div>' },
  'n-button': { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' }
}

describe('SkillCreateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getPlatforms.mockResolvedValue({
      success: true,
      platforms: [
        { id: 'claude', name: 'Claude', exists: true },
        { id: 'codex', name: 'Codex', exists: false }
      ]
    })
    createCustomSkill.mockResolvedValue({ success: true })
  })

  it('打开时获取平台并默认勾选已存在的平台', async () => {
    const wrapper = mount(SkillCreateModal, {
      props: { visible: false },
      global: { stubs }
    })

    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(getPlatforms).toHaveBeenCalled()
    expect(wrapper.vm.formData.platforms).toEqual(['claude'])
    expect(wrapper.vm.availablePlatforms).toHaveLength(2)
  })

  it('提交时包含选中的平台', async () => {
    const wrapper = mount(SkillCreateModal, {
      props: { visible: true },
      global: { stubs }
    })
    
    await flushPromises()
    
    wrapper.vm.formData.directory = 'test-skill'
    wrapper.vm.formData.name = 'Test Skill'
    wrapper.vm.formData.description = 'Test Description'
    wrapper.vm.formData.content = 'Test Content'
    wrapper.vm.formData.platforms = ['claude', 'codex']

    // Mock form validation
    wrapper.vm.formRef = {
      validate: vi.fn().mockResolvedValue(true)
    }

    await wrapper.vm.handleSubmit()

    expect(createCustomSkill).toHaveBeenCalledWith({
      directory: 'test-skill',
      name: 'Test Skill',
      description: 'Test Description',
      content: 'Test Content',
      platforms: ['claude', 'codex']
    })
  })

  it('关闭时重置表单', async () => {
    const wrapper = mount(SkillCreateModal, {
      props: { visible: true },
      global: { stubs }
    })
    
    await flushPromises()
    wrapper.vm.formData.directory = 'dirty'
    
    await wrapper.setProps({ visible: false })
    await nextTick()
    
    expect(wrapper.vm.formData.directory).toBe('')
    expect(wrapper.vm.formData.platforms).toEqual([])
  })
})
