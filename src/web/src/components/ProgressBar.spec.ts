import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProgressBar from './ProgressBar.vue'

const stubs = {
  'n-text': { template: '<span><slot /></span>' },
  'n-tag': { template: '<span><slot /></span>' },
  'n-progress': { template: '<div class="n-progress"></div>' },
  'n-alert': { template: '<div><slot /><slot name="action" /></div>' },
  'n-button': { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' }
}

describe('ProgressBar', () => {
  it('会展示四舍五入后的百分比文本', () => {
    const wrapper = mount(ProgressBar, {
      props: {
        progress: {
          completed: 5,
          total: 10,
          percentage: 49.6,
          errors: []
        },
        status: 'running',
        error: ''
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('正在删除 5/10 (50%)')
  })

  it('有失败项时显示错误并支持重试', async () => {
    const wrapper = mount(ProgressBar, {
      props: {
        progress: {
          completed: 2,
          total: 3,
          percentage: 66,
          errors: [
            { sessionId: 'session-1', error: 'timeout' }
          ]
        },
        status: 'failed',
        error: ''
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('失败 1 项')
    expect(wrapper.text()).toContain('session-1')
    expect(wrapper.text()).toContain('timeout')

    await wrapper.get('[data-testid=\"retry-failed-button\"]').trigger('click')
    expect(wrapper.emitted('retry')?.[0]).toEqual([['session-1']])
  })
})
