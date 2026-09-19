import type { Logger } from '@arxhub/logger'
import { type ChordSource, type HotkeyOutcome, HotkeysExtension, type LayerProbe } from '@arxhub/plugin-hotkeys'
import { describe, expect, test } from 'vitest'
import { declareProseMirrorChords, PROSEMIRROR_BINDINGS, PROSEMIRROR_LAYER } from '../hotkeys'

// Two open `.arx` notes are two mounted panels — the panel store keeps every instance alive — so what
// is exercised here is the ordinary case, not an edge one. Each panel pushes an OCCURRENCE of the one
// editor layer while the chords are declared once, by the plugin; the point of the test is that
// closing a panel takes only its occurrence away.
//
// No DOM: the probe answers by element identity, which is exactly what "the caret is in this panel"
// means to the registry.

const BOLD: ChordSource = { key: 'b', code: 'KeyB', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }

// What the chord resolved to, as one string — an outcome compared field by field needs a narrowing
// dance in every assertion and says less.
function claim(outcome: HotkeyOutcome): string {
  return outcome.kind === 'unclaimed' ? `unclaimed ${outcome.chord}` : `${outcome.kind} ${outcome.binding.id}`
}

function capturing(): { logger: Logger; warnings: string[] } {
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
  return { logger, warnings }
}

function stand() {
  const { logger, warnings } = capturing()
  let caret: unknown = null
  const probe: LayerProbe = (layer) => (layer.element === caret ? { reason: 'focus', depth: 12 } : null)
  const hotkeys = new HotkeysExtension({ logger, probe, platform: 'mac' })

  // What `ArxEditorPlugin.configure()` does: once, for the viewer type.
  declareProseMirrorChords(hotkeys)
  // And the frame's app-wide ⌘B, so a chord that stops being claimed shows up as the column moving
  // rather than as nothing happening.
  hotkeys.register({ id: 'shell.toggle-nav-column', chord: 'Mod-b', layer: 'app', title: 'Collapse navigation', run: () => {} })

  return {
    hotkeys,
    warnings,
    open: () => {
      const element = {} as HTMLElement
      const close = hotkeys.pushLayer({ id: PROSEMIRROR_LAYER, kind: 'editor', element })
      return {
        close,
        focus: () => {
          caret = element
        },
      }
    },
  }
}

describe('two open notes', () => {
  test('declare one set of chords between them, with nothing refused', () => {
    const { hotkeys, warnings, open } = stand()

    open()
    open()

    expect(warnings).toEqual([])
    expect(hotkeys.bindings.value.filter((it) => it.layer === PROSEMIRROR_LAYER)).toHaveLength(PROSEMIRROR_BINDINGS.length)
  })

  test('closing the first leaves the second one its chords', () => {
    const { hotkeys, open } = stand()
    const first = open()
    const second = open()
    second.focus()

    first.close()

    expect(claim(hotkeys.resolve(BOLD))).toBe('yielded editor.bold')
  })

  test('closing the second leaves the first one its chords', () => {
    const { hotkeys, open } = stand()
    const first = open()
    const second = open()
    first.focus()

    second.close()

    expect(claim(hotkeys.resolve(BOLD))).toBe('yielded editor.bold')
  })

  test('and once both are closed the chord is the frame’s again', () => {
    const { hotkeys, open } = stand()
    const first = open()
    const second = open()

    first.close()
    second.close()

    expect(claim(hotkeys.resolve(BOLD))).toBe('ran shell.toggle-nav-column')
  })
})
