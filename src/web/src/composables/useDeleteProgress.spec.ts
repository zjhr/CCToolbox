import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useDeleteProgress } from './useDeleteProgress'
import { getDeleteProgressUrl } from '../api/trash'

vi.mock('../api/trash', () => ({
  getDeleteProgressUrl: vi.fn((taskId: string, lastEventId?: string | null) => {
    const params = new URLSearchParams({ taskId })
    if (lastEventId) {
      params.set('lastEventId', String(lastEventId))
    }
    return `/api/trash/delete-progress?${params.toString()}`
  })
}))

type Listener = (event: any) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  url: string
  readyState = MockEventSource.CONNECTING
  onopen: Listener | null = null
  onerror: Listener | null = null
  private listeners = new Map<string, Listener[]>()
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(event: string, listener: Listener) {
    const existing = this.listeners.get(event) || []
    existing.push(listener)
    this.listeners.set(event, existing)
  }

  close() {
    this.readyState = MockEventSource.CLOSED
    this.closed = true
  }

  emitOpen() {
    this.readyState = MockEventSource.OPEN
    this.onopen?.({ type: 'open' })
  }

  emitEvent(event: string, data: object, lastEventId?: string) {
    const payload = {
      data: JSON.stringify(data),
      lastEventId: lastEventId || ''
    }
    const listeners = this.listeners.get(event) || []
    listeners.forEach(listener => listener(payload))
  }

  emitError() {
    this.readyState = MockEventSource.CLOSED
    this.onerror?.({ type: 'error' })
  }
}

describe('useDeleteProgress', () => {
  function mountHarness() {
    return mount(defineComponent({
      name: 'DeleteProgressHarness',
      setup() {
        return useDeleteProgress()
      },
      template: '<div />'
    }))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource as any)
    vi.mocked(getDeleteProgressUrl).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('断线后会携带 lastEventId 自动重连', () => {
    const wrapper = mountHarness()
    const composable = wrapper.vm as any
    composable.start('task-1')

    expect(MockEventSource.instances.length).toBe(1)
    const firstConnection = MockEventSource.instances[0]
    firstConnection.emitOpen()
    firstConnection.emitEvent('progress', {
      taskId: 'task-1',
      completed: 1,
      total: 3,
      percentage: 33,
      status: 'running',
      current: 's-1'
    }, '7')

    expect(composable.lastEventId).toBe('7')
    firstConnection.emitError()

    vi.advanceTimersByTime(1000)

    expect(MockEventSource.instances.length).toBe(2)
    const secondConnection = MockEventSource.instances[1]
    expect(secondConnection.url).toContain('taskId=task-1')
    expect(secondConnection.url).toContain('lastEventId=7')
    expect(composable.status).toBe('reconnecting')
    wrapper.unmount()
  })

  it('重连超过 5 次仍会持续尝试', () => {
    const wrapper = mountHarness()
    const composable = wrapper.vm as any
    composable.start('task-retry')

    expect(MockEventSource.instances.length).toBe(1)

    const reconnectCount = 7
    for (let index = 0; index < reconnectCount; index += 1) {
      const currentConnection = MockEventSource.instances[index]
      currentConnection.emitError()
      const delay = Math.min(1000 * (2 ** index), 8000)
      vi.advanceTimersByTime(delay)
      expect(MockEventSource.instances.length).toBe(index + 2)
    }

    expect(composable.status).toBe('reconnecting')
    expect(composable.error).toBe(null)
    wrapper.unmount()
  })

  it('stop(reset) 会清空进度状态', () => {
    const wrapper = mountHarness()
    const composable = wrapper.vm as any
    composable.start('task-reset')

    const connection = MockEventSource.instances[0]
    connection.emitOpen()
    connection.emitEvent('progress', {
      taskId: 'task-reset',
      completed: 2,
      total: 5,
      percentage: 40,
      status: 'running',
      current: 'session-2'
    }, '15')

    composable.stop({ reset: true })

    expect(composable.status).toBe('idle')
    expect(composable.taskId).toBe('')
    expect(composable.lastEventId).toBe(null)
    expect(composable.progress.completed).toBe(0)
    expect(composable.progress.total).toBe(0)
    expect(composable.progress.errors).toEqual([])
    wrapper.unmount()
  })

  it('组件卸载时会自动关闭连接', () => {
    const wrapper = mountHarness()
    const composable = wrapper.vm as any
    composable.start('task-2')

    expect(MockEventSource.instances.length).toBe(1)
    const connection = MockEventSource.instances[0]
    expect(connection.closed).toBe(false)

    wrapper.unmount()

    expect(connection.closed).toBe(true)
    expect(composable.status).toBe('idle')
    expect(composable.taskId).toBe('')
  })
})
