import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SpecCard from './SpecCard.vue'

describe('SpecCard', () => {
  it('渲染基本信息并触发打开事件', async () => {
    const item = {
      name: 'API 认证规范',
      fileName: 'spec.md',
      filePath: 'specs/api/spec.md',
      mtime: 1710000000000
    }
    const wrapper = mount(SpecCard, {
      props: {
        item,
        titleHtml: '<span>API 认证规范</span>',
        snippetHtml: '<span>包含认证流程</span>',
        metaText: 'spec.md · 2024/03/09 10:00:00',
        requirementText: '3 项要求',
        disabled: false
      }
    })

    expect(wrapper.classes()).toContain('spec-card')
    expect(wrapper.find('.spec-title').html()).toContain('API 认证规范')
    expect(wrapper.find('.spec-meta').text()).toContain('spec.md')
    expect(wrapper.find('.spec-count').text()).toContain('3 项要求')
    expect(wrapper.attributes('aria-label')).toBe('规范：API 认证规范')

    await wrapper.trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual([item])
  })

  it('支持键盘 Enter 触发打开', async () => {
    const item = { name: 'API 认证规范', fileName: 'spec.md', filePath: 'specs/api/spec.md' }
    const wrapper = mount(SpecCard, {
      props: {
        item,
        titleHtml: 'API 认证规范',
        metaText: 'spec.md',
        requirementText: '1 项要求'
      }
    })

    await wrapper.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('open')?.[0]).toEqual([item])
  })

  it('禁用状态显示对应样式', () => {
    const item = { name: 'API 认证规范', fileName: '', filePath: '' }
    const wrapper = mount(SpecCard, {
      props: {
        item,
        titleHtml: 'API 认证规范',
        metaText: '未找到 spec.md',
        requirementText: '未找到要求',
        disabled: true
      }
    })

    expect(wrapper.classes()).toContain('disabled')
    expect(wrapper.attributes('aria-disabled')).toBe('true')
  })
})
