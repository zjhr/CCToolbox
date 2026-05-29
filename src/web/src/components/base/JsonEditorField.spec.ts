import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import JsonEditorField from './JsonEditorField.vue'

vi.mock('vue-codemirror', () => ({
  Codemirror: defineComponent({
    props: {
      modelValue: {
        type: String,
        default: ''
      },
      placeholder: {
        type: String,
        default: ''
      }
    },
    emits: ['update:modelValue', 'change'],
    template: `
      <textarea
        :value="modelValue"
        class="codemirror-stub"
        :placeholder="placeholder"
        @input="
          $emit('update:modelValue', $event.target.value);
          $emit('change', $event.target.value)
        "
      />
    `
  })
}))

const NButtonStub = defineComponent({
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
})

const NTextStub = defineComponent({
  template: '<span><slot /></span>'
})

const NModalStub = defineComponent({
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:show'],
  template: `
    <div v-if="show" class="n-modal-stub">
      <slot />
      <slot name="footer" />
    </div>
  `
})

function mountEditor(value = '') {
  return mount(JsonEditorField, {
    props: {
      value,
      placeholder: '输入 JSON'
    },
    global: {
      stubs: {
        NButton: NButtonStub,
        NText: NTextStub,
        NModal: NModalStub,
        'n-button': NButtonStub,
        'n-text': NTextStub,
        'n-modal': NModalStub
      }
    }
  })
}

describe('JsonEditorField', () => {
  it('应当可以格式化合法 JSON', async () => {
    const wrapper = mountEditor('{"b":2,"a":1}')

    const formatButton = wrapper.findAll('button').find(item => item.text() === '格式化')
    expect(formatButton?.exists()).toBe(true)

    await formatButton!.trigger('click')

    const emits = wrapper.emitted('update:value') || []
    expect(emits.at(-1)?.[0]).toBe('{\n  "b": 2,\n  "a": 1\n}')
  })

  it('应当可以压缩合法 JSON', async () => {
    const wrapper = mountEditor('{\n  "a": 1,\n  "b": true\n}')

    const minifyButton = wrapper.findAll('button').find(item => item.text() === '压缩')
    expect(minifyButton?.exists()).toBe(true)

    await minifyButton!.trigger('click')

    const emits = wrapper.emitted('update:value') || []
    expect(emits.at(-1)?.[0]).toBe('{"a":1,"b":true}')
  })

  it('无效 JSON 时应展示错误提示，且格式化不改值', async () => {
    const wrapper = mountEditor('{"a":1')

    expect(wrapper.text()).toContain('JSON 格式错误')

    const formatButton = wrapper.findAll('button').find(item => item.text() === '格式化')
    await formatButton!.trigger('click')

    expect(wrapper.emitted('update:value')).toBeUndefined()
  })

  it('点击放大编辑后应显示放大弹层', async () => {
    const wrapper = mountEditor('{"a":1}')

    const expandButton = wrapper.findAll('button').find(item => item.text() === '放大编辑')
    expect(expandButton?.exists()).toBe(true)

    await expandButton!.trigger('click')
    await nextTick()

    const setupState = wrapper.vm.$.setupState as {
      showExpanded: boolean
    }
    expect(setupState.showExpanded).toBe(true)
  })
})
