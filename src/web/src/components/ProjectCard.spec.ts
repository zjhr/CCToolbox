import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectCard from './ProjectCard.vue'

vi.mock('@vicons/ionicons5', () => ({
  FolderOpenOutline: { template: '<span />' },
  ReorderThreeOutline: { template: '<span />' },
  TrashOutline: { template: '<span />' }
}))

const stubs = {
  'n-icon': { template: '<span><slot /></span>' },
  'n-text': { template: '<span><slot /></span>' },
  'n-tag': { template: '<span><slot /></span>' },
  'n-button': { template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>' }
}

const project = {
  name: '/',
  displayName: '/',
  fullPath: '/',
  sessionCount: 1
}

describe('ProjectCard', () => {
  it('点击卡片主体会触发 click 事件', async () => {
    const wrapper = mount(ProjectCard, {
      props: { project, sortable: true },
      global: { stubs }
    })

    await wrapper.find('.project-card').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('点击拖拽手柄不会触发 click 事件', async () => {
    const wrapper = mount(ProjectCard, {
      props: { project, sortable: true },
      global: { stubs }
    })

    await wrapper.find('.drag-handle').trigger('click')

    expect(wrapper.emitted('click')).toBeUndefined()
  })
})
