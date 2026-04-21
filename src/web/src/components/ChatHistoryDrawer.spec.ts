import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ChatHistoryDrawer from './ChatHistoryDrawer.vue'
import { getSessionMessages } from '../api/sessions'

vi.mock('../api/sessions', () => ({
  getSessionMessages: vi.fn()
}))

vi.mock('../api/trash', () => ({
  getTrashMessages: vi.fn()
}))

vi.mock('../utils/messageAdapter', () => ({
  adaptMessages: vi.fn((messages) => messages)
}))

vi.mock('../composables/useResponsiveDrawer', () => ({
  useResponsiveDrawer: () => ({
    drawerWidth: 900
  })
}))

vi.mock('naive-ui', () => ({
  NDrawer: {
    name: 'NDrawer',
    template: '<div><slot /></div>'
  },
  NIcon: {
    name: 'NIcon',
    template: '<span><slot /></span>'
  },
  NTag: {
    name: 'NTag',
    template: '<span><slot /></span>'
  },
  NSpin: {
    name: 'NSpin',
    template: '<div><slot /></div>'
  },
  NEmpty: {
    name: 'NEmpty',
    template: '<div><slot /><slot name="extra" /></div>'
  },
  NButton: {
    name: 'NButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  NVirtualList: {
    name: 'NVirtualList',
    props: {
      items: {
        type: Array,
        default: () => []
      }
    },
    methods: {
      scrollTo(payload: unknown) {
        ;(globalThis as { __chatDrawerVirtualListScrollSpy?: (input: unknown) => void }).__chatDrawerVirtualListScrollSpy?.(payload)
      }
    },
    template: `
      <div class="virtual-list-stub">
        <div
          v-for="item in items"
          :key="item.id"
          class="virtual-item"
        >
          <slot :item="item" />
        </div>
      </div>
    `
  }
}))

vi.mock('@vicons/ionicons5', () => ({
  Chatbubbles: {},
  GitBranch: {},
  ChevronUp: {},
  ArrowDown: {},
  Close: {},
  ArrowBackOutline: {}
}))

vi.mock('./SessionSummaryCard.vue', () => ({
  default: {
    name: 'SessionSummaryCard',
    template: '<div />'
  }
}))

vi.mock('./chat/FilterBar.vue', () => ({
  default: {
    name: 'FilterBar',
    template: '<div />'
  }
}))

vi.mock('./chat/SubagentDetailView.vue', () => ({
  default: {
    name: 'SubagentDetailView',
    template: '<div />'
  }
}))

vi.mock('./ChatMessage.vue', () => ({
  default: {
    name: 'ChatMessage',
    props: {
      message: {
        type: Object,
        required: true
      }
    },
    template: '<div class="chat-msg" :data-id="message.id">{{ message.id }}</div>'
  }
}))

const virtualListScrollTo = vi.fn()
let socketInstances: Array<{ onmessage?: (event: { data: string }) => void }> = []

const flushPromises = async () => {
  await Promise.resolve()
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function createMessage(id: string) {
  return {
    id,
    role: 'assistant',
    content: `message-${id}`,
    timestamp: '2026-04-21T08:00:00.000Z'
  }
}

function getRenderedIds(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.chat-msg').map((item) => item.attributes('data-id'))
}

async function mountAndOpenDrawer() {
  const wrapper = mount(ChatHistoryDrawer, {
    props: {
      show: true,
      projectName: 'demo-project',
      sessionId: 'session-1',
      channel: 'claude'
    },
    global: {
      stubs: {
        teleport: true
      }
    }
  })

  wrapper.vm.open()
  await flushPromises()
  return wrapper
}

describe('ChatHistoryDrawer session-update（RED）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    virtualListScrollTo.mockReset()
    socketInstances = []

    vi.stubGlobal('__chatDrawerVirtualListScrollSpy', virtualListScrollTo)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => {
      const socket = {
        onmessage: undefined as ((event: { data: string }) => void) | undefined,
        send: vi.fn(),
        close: vi.fn()
      }
      socketInstances.push(socket)
      return socket
    }))

    vi.mocked(getSessionMessages).mockResolvedValue({
      messages: [createMessage('m2'), createMessage('m1')],
      metadata: {},
      pagination: {
        page: 1,
        total: 2,
        hasMore: false
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function emitSessionUpdate(payload: { sessionId: string, messages: Array<Record<string, unknown>> }) {
    const socket = socketInstances[0]
    expect(socket).toBeDefined()
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'session-update',
        ...payload
      })
    })
    await flushPromises()
  }

  it('GIVEN 已加载消息列表, WHEN 推送 id 已存在的消息, THEN 该消息被忽略', async () => {
    const wrapper = await mountAndOpenDrawer()
    expect(globalThis.WebSocket).toHaveBeenCalledTimes(1)
    const beforeIds = getRenderedIds(wrapper)

    await emitSessionUpdate({
      sessionId: 'session-1',
      messages: [createMessage('m2')]
    })

    expect(getRenderedIds(wrapper)).toEqual(beforeIds)
  })

  it('GIVEN 已加载消息列表, WHEN 推送新消息(id未存在), THEN 追加到数组末尾', async () => {
    const wrapper = await mountAndOpenDrawer()
    expect(globalThis.WebSocket).toHaveBeenCalledTimes(1)

    await emitSessionUpdate({
      sessionId: 'session-1',
      messages: [createMessage('m3')]
    })

    expect(getRenderedIds(wrapper)).toEqual(['m1', 'm2', 'm3'])
  })

  it('GIVEN 用户在底部(≤100px), WHEN 新消息追加, THEN 自动滚动到底部', async () => {
    const wrapper = await mountAndOpenDrawer()
    expect(globalThis.WebSocket).toHaveBeenCalledTimes(1)

    const virtualList = wrapper.findComponent({ name: 'NVirtualList' })
    virtualList.vm.$emit('scroll', {
      target: {
        scrollTop: 520,
        scrollHeight: 1000,
        clientHeight: 400
      }
    })
    await flushPromises()
    virtualListScrollTo.mockClear()

    await emitSessionUpdate({
      sessionId: 'session-1',
      messages: [createMessage('m4')]
    })

    expect(virtualListScrollTo).toHaveBeenCalledWith(expect.objectContaining({
      position: 'bottom'
    }))
  })

  it('GIVEN 用户不在底部(>100px), WHEN 新消息追加, THEN 不自动滚动', async () => {
    const wrapper = await mountAndOpenDrawer()
    expect(globalThis.WebSocket).toHaveBeenCalledTimes(1)

    const virtualList = wrapper.findComponent({ name: 'NVirtualList' })
    virtualList.vm.$emit('scroll', {
      target: {
        scrollTop: 380,
        scrollHeight: 1000,
        clientHeight: 400
      }
    })
    await flushPromises()
    virtualListScrollTo.mockClear()

    await emitSessionUpdate({
      sessionId: 'session-1',
      messages: [createMessage('m5')]
    })

    expect(virtualListScrollTo).not.toHaveBeenCalled()
  })
})
