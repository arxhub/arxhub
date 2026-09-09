import type { Logger } from '@arxhub/logger'
import { describe, expect, it } from 'vitest'
import type { ChordSource } from '../chord'
import { type HotkeyLayer, HotkeysExtension, type LayerProbe } from '../hotkeys-extension'

// The layers a test has decided are up, by id. No DOM anywhere: the interesting rules are the stack
// and the resolution, and both are reachable through the probe.
function probeOf(up: Record<string, { reason?: 'focus' | 'visible'; depth: number }>): LayerProbe {
  return (layer: HotkeyLayer) => {
    const on = up[layer.id]
    return on == null ? null : { reason: on.reason ?? 'focus', depth: on.depth }
  }
}

interface Warned {
  warnings: string[]
  logger: Logger
}

function fakeLogger(): Warned {
  const warnings: string[] = []
  const logger = {
    warn: (message: unknown) => warnings.push(String(message)),
    error: () => {},
    info: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => logger,
  } as unknown as Logger
  return { warnings, logger }
}

function build(up: Record<string, { reason?: 'focus' | 'visible'; depth: number }> = {}): { it: HotkeysExtension; warnings: string[] } {
  const { warnings, logger } = fakeLogger()
  return { it: new HotkeysExtension({ logger, probe: probeOf(up), platform: 'mac' }), warnings }
}

// The layers a test pushes never have their element read — the probe answers by id.
function layer(id: string, kind: HotkeyLayer['kind'], modal = false): HotkeyLayer {
  return { id, kind, element: null as unknown as HTMLElement, modal }
}

function keydown(over: Partial<ChordSource>): KeyboardEvent {
  const event = { key: '', code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over }
  return { ...event, prevented: false, stopped: false, preventDefault(): void {}, stopPropagation(): void {} } as unknown as KeyboardEvent
}

// A keydown that records what was done to it — the whole point of the "unclaimed chords are not
// touched" rule is that nothing is done to them.
function recorded(over: Partial<ChordSource>): { event: KeyboardEvent; prevented: boolean; stopped: boolean } {
  const state = { prevented: false, stopped: false }
  const event = {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
    preventDefault: () => {
      state.prevented = true
    },
    stopPropagation: () => {
      state.stopped = true
    },
  } as unknown as KeyboardEvent
  return {
    event,
    get prevented() {
      return state.prevented
    },
    get stopped() {
      return state.stopped
    },
  }
}

describe('resolution order', () => {
  it('gives the chord to the layer on top and never asks the ones below', () => {
    const { it: hotkeys } = build({ 'type:notes': { reason: 'visible', depth: 5 } })
    hotkeys.pushLayer(layer('type:notes', 'type'))
    const ran: string[] = []
    hotkeys.register({ id: 'app.column', chord: 'Mod-b', layer: 'app', title: 'Column', run: () => ran.push('app') })
    hotkeys.register({ id: 'notes.bold', chord: 'Mod-b', layer: 'type:notes', title: 'Bold', run: () => ran.push('type') })

    hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true }))
    expect(ran).toEqual(['type'])
  })

  it('skips a binding whose condition does not hold and carries on down the stack', () => {
    const { it: hotkeys } = build({ 'type:notes': { reason: 'visible', depth: 5 } })
    hotkeys.pushLayer(layer('type:notes', 'type'))
    const ran: string[] = []
    hotkeys.register({ id: 'app.column', chord: 'Mod-b', layer: 'app', title: 'Column', run: () => ran.push('app') })
    hotkeys.register({ id: 'notes.bold', chord: 'Mod-b', layer: 'type:notes', title: 'Bold', when: () => false, run: () => ran.push('type') })

    hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true }))
    expect(ran).toEqual(['app'])
  })

  it('leaves a chord nobody claimed completely alone', () => {
    const { it: hotkeys } = build()
    hotkeys.register({ id: 'app.column', chord: 'Mod-b', layer: 'app', title: 'Column', when: () => false, run: () => {} })

    const seen = recorded({ key: 'b', code: 'KeyB', metaKey: true })
    expect(hotkeys.dispatch(seen.event).kind).toBe('unclaimed')
    expect(seen.prevented).toBe(false)
    expect(seen.stopped).toBe(false)
  })

  it('takes the event away from everyone once a binding has run', () => {
    const { it: hotkeys } = build()
    hotkeys.register({ id: 'app.sheet', chord: 'Mod-k', layer: 'app', title: 'Open', run: () => {} })

    const seen = recorded({ key: 'k', code: 'KeyK', metaKey: true })
    expect(hotkeys.dispatch(seen.event).kind).toBe('ran')
    expect(seen.prevented).toBe(true)
    expect(seen.stopped).toBe(true)
  })
})

describe('a foreign keymap (F-06)', () => {
  it('stops the stack without touching the event, so the library gets the keystroke', () => {
    const { it: hotkeys } = build({ 'editor:codemirror': { depth: 12 } })
    hotkeys.pushLayer(layer('editor:codemirror', 'editor'))
    let column = 0
    hotkeys.register({ id: 'shell.column', chord: 'Mod-b', layer: 'app', title: 'Column', run: () => column++ })
    // No `run`: CodeMirror handles it, the registry only knows it is taken.
    hotkeys.register({ id: 'codemirror.bold', chord: 'Mod-b', layer: 'editor:codemirror', title: 'Bold' })

    const seen = recorded({ key: 'b', code: 'KeyB', metaKey: true })
    expect(hotkeys.dispatch(seen.event).kind).toBe('yielded')
    expect(column).toBe(0)
    expect(seen.prevented).toBe(false)
    expect(seen.stopped).toBe(false)
  })

  it('yields only the chords it declared — the rest still reach the layers below', () => {
    const { it: hotkeys } = build({ 'editor:codemirror': { depth: 12 } })
    hotkeys.pushLayer(layer('editor:codemirror', 'editor'))
    let opened = 0
    hotkeys.register({ id: 'shell.sheet', chord: 'Mod-k', layer: 'app', title: 'Open', run: () => opened++ })
    hotkeys.register({ id: 'codemirror.bold', chord: 'Mod-b', layer: 'editor:codemirror', title: 'Bold' })

    hotkeys.dispatch(keydown({ key: 'k', code: 'KeyK', metaKey: true }))
    expect(opened).toBe(1)
  })
})

describe('what puts a layer on the stack', () => {
  it('a type is up while its stage is on screen, whether or not anything in it holds focus', () => {
    const { it: hotkeys } = build({ 'type:settings': { reason: 'visible', depth: 5 } })
    hotkeys.pushLayer(layer('type:settings', 'type'))
    let saved = 0
    hotkeys.register({ id: 'settings.save', chord: 'Mod-s', layer: 'type:settings', title: 'Save', run: () => saved++ })

    hotkeys.dispatch(keydown({ key: 's', code: 'KeyS', metaKey: true }))
    expect(saved).toBe(1)
  })

  it('a type whose stage is off screen cannot claim anything, whatever it left registered', () => {
    // The ⌘S leak, made unrepresentable: the settings layout is never unmounted, so its registration
    // outlives every visit — and it still loses, because a hidden stage is not on the stack.
    const { it: hotkeys } = build({})
    hotkeys.pushLayer(layer('type:settings', 'type'))
    let saved = 0
    hotkeys.register({ id: 'settings.save', chord: 'Mod-s', layer: 'type:settings', title: 'Save', run: () => saved++ })

    const seen = recorded({ key: 's', code: 'KeyS', metaKey: true })
    expect(hotkeys.dispatch(seen.event).kind).toBe('unclaimed')
    expect(saved).toBe(0)
    expect(seen.prevented).toBe(false)
  })

  it('a modal cuts the layers under it', () => {
    const { it: hotkeys } = build({ 'type:notes': { reason: 'visible', depth: 7 }, 'layer:sheet': { depth: 3 } })
    hotkeys.pushLayer(layer('type:notes', 'type'))
    hotkeys.pushLayer(layer('layer:sheet', 'layer', true))
    let column = 0
    hotkeys.register({ id: 'shell.column', chord: 'Mod-b', layer: 'app', title: 'Column', run: () => column++ })

    expect(hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true })).kind).toBe('unclaimed')
    expect(column).toBe(0)
  })
})

describe('registration', () => {
  it('keeps the first claim on a chord and names both sides in the warning (F-05)', () => {
    const { it: hotkeys, warnings } = build()
    const ran: string[] = []
    hotkeys.register({ id: 'first.thing', chord: 'Mod-b', layer: 'app', title: 'First', run: () => ran.push('first') })
    hotkeys.register({ id: 'second.thing', chord: 'Mod-b', layer: 'app', title: 'Second', run: () => ran.push('second') })

    hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true }))
    expect(ran).toEqual(['first'])
    expect(warnings.join('\n')).toContain('first.thing')
    expect(warnings.join('\n')).toContain('second.thing')
    expect(hotkeys.bindings.value).toHaveLength(1)
  })

  it('lets the same chord be claimed in two different layers — that is the point', () => {
    const { it: hotkeys, warnings } = build()
    hotkeys.register({ id: 'shell.column', chord: 'Mod-b', layer: 'app', title: 'Column', run: () => {} })
    hotkeys.register({ id: 'codemirror.bold', chord: 'Mod-b', layer: 'editor:codemirror', title: 'Bold' })

    expect(warnings).toHaveLength(0)
    expect(hotkeys.shadows()).toEqual([{ chord: 'Mod-b', by: 'codemirror.bold', over: 'shell.column' }])
  })

  it('refuses a chord the system owns and one with no modifier', () => {
    const { it: hotkeys, warnings } = build()
    hotkeys.register({ id: 'greedy.close', chord: 'Mod-w', layer: 'app', title: 'Close', run: () => {} })
    hotkeys.register({ id: 'greedy.new', chord: 'n', layer: 'app', title: 'New', run: () => {} })

    expect(hotkeys.bindings.value).toHaveLength(0)
    expect(warnings.join('\n')).toMatch(/belongs to the system/)
    expect(warnings.join('\n')).toMatch(/without a modifier/)
  })

  it('normalizes on the way in, so two spellings of one chord are one chord', () => {
    const { it: hotkeys, warnings } = build()
    hotkeys.register({ id: 'a', chord: 'Mod-Shift-k', layer: 'app', title: 'A', run: () => {} })
    hotkeys.register({ id: 'b', chord: 'Shift-Mod-K', layer: 'app', title: 'B', run: () => {} })

    expect(hotkeys.bindings.value).toHaveLength(1)
    expect(warnings.join('\n')).toContain('Mod-Shift-k')
  })
})

describe('disposers', () => {
  it('a released binding stops claiming its chord', () => {
    const { it: hotkeys } = build()
    let ran = 0
    const dispose = hotkeys.register({ id: 'app.thing', chord: 'Mod-b', layer: 'app', title: 'Thing', run: () => ran++ })

    hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true }))
    dispose()
    hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true }))

    expect(ran).toBe(1)
    expect(hotkeys.bindings.value).toHaveLength(0)
  })

  it('a released layer leaves the stack, and the chord falls through to the one below', () => {
    const { it: hotkeys } = build({ 'editor:codemirror': { depth: 12 } })
    const dispose = hotkeys.pushLayer(layer('editor:codemirror', 'editor'))
    let column = 0
    hotkeys.register({ id: 'shell.column', chord: 'Mod-b', layer: 'app', title: 'Column', run: () => column++ })
    hotkeys.register({ id: 'codemirror.bold', chord: 'Mod-b', layer: 'editor:codemirror', title: 'Bold' })

    expect(hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true })).kind).toBe('yielded')
    dispose()
    expect(hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true })).kind).toBe('ran')
    expect(column).toBe(1)
  })

  it('releasing one of two claims on a chord frees it for the other', () => {
    const { it: hotkeys } = build()
    const dispose = hotkeys.register({ id: 'first', chord: 'Mod-b', layer: 'app', title: 'First', run: () => {} })
    dispose()
    let ran = 0
    hotkeys.register({ id: 'second', chord: 'Mod-b', layer: 'app', title: 'Second', run: () => ran++ })

    hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true }))
    expect(ran).toBe(1)
  })
})

describe('enumerability (F-11)', () => {
  it('lists every binding with its layer, chord, id and label', () => {
    const { it: hotkeys } = build()
    hotkeys.register({ id: 'shell.column', chord: 'Mod-b', layer: 'app', title: 'Collapse navigation', run: () => {} })
    hotkeys.register({ id: 'shell.sheet', chord: 'Mod-k', layer: 'app', title: 'Open or switch to', run: () => {} })

    expect(hotkeys.bindings.value.map((it) => ({ id: it.id, chord: it.chord, layer: it.layer, label: hotkeys.label(it.chord) }))).toEqual([
      { id: 'shell.column', chord: 'Mod-b', layer: 'app', label: '⌘B' },
      { id: 'shell.sheet', chord: 'Mod-k', layer: 'app', label: '⌘K' },
    ])
  })

  it('holds no two claims on one chord in one layer — the check the product is now able to make', () => {
    const { it: hotkeys } = build()
    hotkeys.register({ id: 'a', chord: 'Mod-b', layer: 'app', title: 'A', run: () => {} })
    hotkeys.register({ id: 'b', chord: 'Mod-k', layer: 'app', title: 'B', run: () => {} })
    hotkeys.register({ id: 'c', chord: 'Mod-b', layer: 'type:notes', title: 'C', run: () => {} })

    const seen = new Set(hotkeys.bindings.value.map((it) => `${it.layer} ${it.chord}`))
    expect(seen.size).toBe(hotkeys.bindings.value.length)
  })
})

// A layer id names a viewer TYPE while a mount is one open object, so SEVERAL occurrences of one id
// are the normal case rather than a mistake: two open notes are two of them, and both stay mounted.
// Releasing one has to take away only that one — the defect this pins down had the second note's ⌘B
// collapsing the navigation column the moment the first note was closed.
describe('several occurrences of one layer', () => {
  it('keeps the layer up while another occurrence still holds focus', () => {
    const { warnings, logger } = fakeLogger()
    const first = {} as HTMLElement
    const second = {} as HTMLElement
    // The caret is in the second one, which is what a probe reading the live document would answer.
    const probe: LayerProbe = (it) => (it.element === second ? { reason: 'focus', depth: 12 } : null)
    const hotkeys = new HotkeysExtension({ logger, probe, platform: 'mac' })
    const closeFirst = hotkeys.pushLayer({ id: 'editor:codemirror', kind: 'editor', element: first })
    hotkeys.pushLayer({ id: 'editor:codemirror', kind: 'editor', element: second })
    hotkeys.register({ id: 'shell.column', chord: 'Mod-b', layer: 'app', title: 'Column', run: () => {} })
    hotkeys.register({ id: 'codemirror.bold', chord: 'Mod-b', layer: 'editor:codemirror', title: 'Bold' })

    closeFirst()

    expect(hotkeys.stack()).toEqual(['editor:codemirror', 'app'])
    expect(hotkeys.dispatch(keydown({ key: 'b', code: 'KeyB', metaKey: true })).kind).toBe('yielded')
    expect(warnings).toEqual([])
  })
})
