import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TemporarySpecCard from './TemporarySpecCard.vue'

const stubs = {
  'n-tag': { template: '<span class="n-tag"><slot /></span>' }
}

describe('TemporarySpecCard', () => {
  it('渲染临时规范标识与来源信息', () => {
    const item = {
      name: 'API 认证规范',
      fileName: 'spec.md',
      filePath: 'changes/add-auth/specs/api/spec.md',
      changeId: 'add-auth'
    }
    const wrapper = mount(TemporarySpecCard, {
      props: {
        item,
        titleHtml: 'API 认证规范',
        metaText: 'spec.md',
        requirementText: '2 项要求',
        sourceLabel: '来自: add-auth'
      },
      global: { stubs }
    })

    expect(wrapper.classes()).toContain('spec-card--temporary')
    expect(wrapper.text()).toContain('临时')
    expect(wrapper.text()).toContain('来自: add-auth')
    expect(wrapper.attributes('aria-label')).toBe('临时规范：API 认证规范，来自 add-auth')
  })

  it('支持键盘 Enter 触发打开', async () => {
    const item = {
      name: 'API 认证规范',
      fileName: 'spec.md',
      filePath: 'changes/add-auth/specs/api/spec.md',
      changeId: 'add-auth'
    }
    const wrapper = mount(TemporarySpecCard, {
      props: {
        item,
        titleHtml: 'API 认证规范',
        metaText: 'spec.md',
        requirementText: '1 项要求',
        sourceLabel: '来自: add-auth'
      },
      global: { stubs }
    })

    await wrapper.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('open')?.[0]).toEqual([item])
  })
})
