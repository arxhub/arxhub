import type { Logger } from '@arxhub/logger'
import { type ChordSource, type HotkeyOutcome, HotkeysExtension, type LayerProbe } from '@arxhub/plugin-hotkeys'
import { describe, expect, test } from 'vitest'
import { CODEMIRROR_BINDINGS, CODEMIRROR_LAYER, declareCodeMirrorChords } from '../hotkeys'

// Two open notes are two mounted editors — the panel store keeps every instance alive — so what is
// exercised here is the ordinary case, not an edge one. Each editor pushes an OCCURRENCE of the one
// editor layer while the four chords are declared once, by the plugin; the point of the test is that
// closing a note takes only its occurrence away.
//
// No DOM: the probe answers by element identity, which is exactly what "the caret is in this editor"
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

  // What `CodeMirrorPlugin.configure()` does: once, for the viewer type.
  declareCodeMirrorChords(hotkeys)
  // And the frame's app-wide ⌘B, so a chord that stops being claimed shows up as the column moving
  // rather than as nothing happening.
  hotkeys.register({ id: 'shell.toggle-nav-column', chord: 'Mod-b', layer: 'app', title: 'Collapse navigation', run: () => {} })

  const editor = (markdown: boolean) => {
    const element = {} as HTMLElement
    // The layer belongs to the markdown keymap, and `CodeMirrorEditor` installs that for a note alone
    // — so a code file's editor pushes nothing, which is how a `.ts` file keeps ⌘B for the column.
    const close = markdown ? hotkeys.pushLayer({ id: CODEMIRROR_LAYER, kind: 'editor', element }) : () => {}
    return {
      close,
      focus: () => {
        caret = element
      },
    }
  }

  return { hotkeys, warnings, openNote: () => editor(true), openCodeFile: () => editor(false) }
}

describe('two open notes', () => {
  test('declare one set of chords between them, with nothing refused', () => {
    const { hotkeys, warnings, openNote } = stand()

    openNote()
    openNote()

    expect(warnings).toEqual([])
    expect(hotkeys.bindings.value.filter((it) => it.layer === CODEMIRROR_LAYER)).toHaveLength(CODEMIRROR_BINDINGS.length)
  })

  test('closing the first leaves the second one its chords', () => {
    const { hotkeys, openNote } = stand()
    const first = openNote()
    const second = openNote()
    second.focus()

    first.close()

    expect(claim(hotkeys.resolve(BOLD))).toBe('yielded codemirror.bold')
  })

  test('closing the second leaves the first one its chords', () => {
    const { hotkeys, openNote } = stand()
    const first = openNote()
    const second = openNote()
    first.focus()

    second.close()

    expect(claim(hotkeys.resolve(BOLD))).toBe('yielded codemirror.bold')
  })
})

describe('a code file claims nothing', () => {
  test('⌘B over one collapses the column, even with a note open beside it', () => {
    const { hotkeys, openNote, openCodeFile } = stand()
    openNote()
    const code = openCodeFile()

    code.focus()

    expect(claim(hotkeys.resolve(BOLD))).toBe('ran shell.toggle-nav-column')
  })
})
