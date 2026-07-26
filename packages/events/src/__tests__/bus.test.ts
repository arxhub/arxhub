import { describe, expect, it, vi } from 'vitest'
import { createEventBus } from '../bus'

interface TestEvents {
  ping: { n: number }
  pong: { text: string }
}

describe('createEventBus', () => {
  it('delivers a payload only to the listeners of that event', () => {
    const bus = createEventBus<TestEvents>()
    const ping = vi.fn()
    const pong = vi.fn()
    bus.on('ping', ping)
    bus.on('pong', pong)

    bus.emit('ping', { n: 1 })

    expect(ping).toHaveBeenCalledWith({ n: 1 })
    expect(pong).not.toHaveBeenCalled()
  })

  it('stops delivering once the handle returned by on() is called', () => {
    const bus = createEventBus<TestEvents>()
    const listener = vi.fn()
    const unsubscribe = bus.on('ping', listener)

    unsubscribe()
    bus.emit('ping', { n: 1 })

    expect(listener).not.toHaveBeenCalled()
    expect(bus.listenerCount('ping')).toBe(0)
  })

  it('drops only its own registration when the same function is subscribed twice', () => {
    const bus = createEventBus<TestEvents>()
    const listener = vi.fn()
    const first = bus.on('ping', listener)
    bus.on('ping', listener)

    first()
    bus.emit('ping', { n: 1 })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: a handle called twice does not remove a later subscription', () => {
    const bus = createEventBus<TestEvents>()
    const listener = vi.fn()
    const unsubscribe = bus.on('ping', listener)
    unsubscribe()
    bus.on('ping', listener)

    unsubscribe()
    bus.emit('ping', { n: 1 })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('runs a once() listener exactly once', () => {
    const bus = createEventBus<TestEvents>()
    const listener = vi.fn()
    bus.once('ping', listener)

    bus.emit('ping', { n: 1 })
    bus.emit('ping', { n: 2 })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ n: 1 })
  })

  it('notifies the listeners registered when the emit began, and no others', () => {
    const bus = createEventBus<TestEvents>()
    const late = vi.fn()
    const second = vi.fn()
    bus.on('ping', () => {
      bus.on('ping', late)
    })
    bus.on('ping', second)

    bus.emit('ping', { n: 1 })

    expect(late).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('does not call a listener that a preceding listener unsubscribed', () => {
    const bus = createEventBus<TestEvents>()
    const later = vi.fn()
    const unsubscribeLater = () => {
      handle()
    }
    bus.on('ping', unsubscribeLater)
    const handle = bus.on('ping', later)

    bus.emit('ping', { n: 1 })

    expect(later).not.toHaveBeenCalled()
  })

  it('stops the round when a listener removes every listener', () => {
    const bus = createEventBus<TestEvents>()
    const later = vi.fn()
    bus.on('ping', () => {
      bus.removeAllListeners()
    })
    bus.on('ping', later)

    bus.emit('ping', { n: 1 })

    expect(later).not.toHaveBeenCalled()
  })

  it('lets a listener error reach the caller when no handler was given', () => {
    const bus = createEventBus<TestEvents>()
    bus.on('ping', () => {
      throw new Error('boom')
    })

    expect(() => bus.emit('ping', { n: 1 })).toThrow('boom')
  })

  it('reports a throwing listener and keeps notifying the rest when a handler was given', () => {
    const onError = vi.fn()
    const bus = createEventBus<TestEvents>({ onError })
    const error = new Error('boom')
    bus.on('ping', () => {
      throw error
    })
    const survivor = vi.fn()
    bus.on('ping', survivor)

    bus.emit('ping', { n: 7 })

    expect(onError).toHaveBeenCalledWith(error, 'ping', { n: 7 })
    expect(survivor).toHaveBeenCalledWith({ n: 7 })
  })

  it('does not re-run a once() listener that threw', () => {
    const onError = vi.fn()
    const bus = createEventBus<TestEvents>({ onError })
    const listener = vi.fn(() => {
      throw new Error('boom')
    })
    bus.once('ping', listener)

    bus.emit('ping', { n: 1 })
    bus.emit('ping', { n: 2 })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('removes listeners by event, or all of them', () => {
    const bus = createEventBus<TestEvents>()
    bus.on('ping', vi.fn())
    bus.on('pong', vi.fn())

    bus.removeAllListeners('ping')
    expect(bus.listenerCount('ping')).toBe(0)
    expect(bus.listenerCount('pong')).toBe(1)

    bus.removeAllListeners()
    expect(bus.listenerCount('pong')).toBe(0)
  })

  it('emits to no one without throwing when nothing is subscribed', () => {
    const bus = createEventBus<TestEvents>()
    expect(() => bus.emit('ping', { n: 1 })).not.toThrow()
  })
})
