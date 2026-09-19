import type { Logger } from '@arxhub/logger'
import { describe, expect, it, vi } from 'vitest'
import type { LayerProbe } from '../hotkeys-extension'
import { HotkeysExtension } from '../hotkeys-extension'

function capturing(): Logger {
  return {
    warn: () => {},
    error: () => {},
    info: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => capturing(),
  } as unknown as Logger
}

function keyEvent(): KeyboardEvent {
  return {
    key: 'b',
    code: 'KeyB',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent
}

describe('dispatch', () => {
  it('leaves an unclaimed chord untouched', () => {
    const hotkeys = new HotkeysExtension({ logger: capturing(), platform: 'mac' })
    const ev = keyEvent()
    expect(hotkeys.dispatch(ev).kind).toBe('unclaimed')
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(ev.stopPropagation).not.toHaveBeenCalled()
  })

  it('leaves a foreign chord untouched so the library still sees it', () => {
    let caret: unknown = null
    const probe: LayerProbe = (layer) => (layer.element === caret ? { reason: 'focus', depth: 12 } : null)
    const hotkeys = new HotkeysExtension({ logger: capturing(), platform: 'mac', probe })
    const element = {} as HTMLElement
    hotkeys.register({ id: 'editor.bold', chord: 'Mod-b', layer: 'editor', title: 'Bold' })
    hotkeys.pushLayer({ id: 'editor', kind: 'editor', element })
    caret = element
    const ev = keyEvent()
    expect(hotkeys.dispatch(ev).kind).toBe('yielded')
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(ev.stopPropagation).not.toHaveBeenCalled()
  })

  it('consumes a chord that ran', () => {
    const hotkeys = new HotkeysExtension({ logger: capturing(), platform: 'mac' })
    const ran = vi.fn()
    hotkeys.register({ id: 'app.action', chord: 'Mod-b', layer: 'app', title: 'Action', run: ran })
    const ev = keyEvent()
    expect(hotkeys.dispatch(ev).kind).toBe('ran')
    expect(ran).toHaveBeenCalledOnce()
    expect(ev.preventDefault).toHaveBeenCalledOnce()
    expect(ev.stopPropagation).toHaveBeenCalledOnce()
  })

  it('treats when: false as unclaimed rather than swallowing the chord', () => {
    const hotkeys = new HotkeysExtension({ logger: capturing(), platform: 'mac' })
    const blocked = vi.fn()
    hotkeys.register({
      id: 'settings.save-all',
      chord: 'Mod-b',
      layer: 'app',
      title: 'Save',
      when: () => false,
      run: blocked,
    })
    const ev = keyEvent()
    expect(hotkeys.dispatch(ev).kind).toBe('unclaimed')
    expect(blocked).not.toHaveBeenCalled()
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(ev.stopPropagation).not.toHaveBeenCalled()
  })
})
