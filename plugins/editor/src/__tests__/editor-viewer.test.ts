import { ConsoleLogger } from '@arxhub/logger'
import { NotesExtension } from '@arxhub/plugin-notes'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { EDITOR_VIEWER } from '../editor-plugin'

// The registry only reads the descriptor here, so the vault is never touched — a stub that throws is
// what proves it.
const noVfs = new Proxy(
  {},
  {
    get(): never {
      throw new Error('the viewer registry must not touch the vault')
    },
  },
) as VirtualFileSystem

function registry(): NotesExtension {
  const notes = new NotesExtension({ logger: new ConsoleLogger(), vfs: noVfs, root: '/' })
  notes.registerViewer(EDITOR_VIEWER)
  return notes
}

describe('the document editor as a viewer of a note', () => {
  test('the document format is answered', () => {
    expect(registry().viewerFor('vault/contract.arx')?.id).toBe(EDITOR_VIEWER.id)
  })

  // The lookup the tree and search go through folds the case; the panel store's own match did not, so
  // a document saved as '.ARX' used to be a file nothing could open.
  test('the case the name was written in does not decide whether it opens', () => {
    expect(registry().viewerFor('vault/CONTRACT.ARX')?.id).toBe(EDITOR_VIEWER.id)
  })

  // The string the panel store was registered under: openers pass `panelId`, so a change here that did
  // not reach `registerPanel` would open nothing.
  test('the panel it opens through is named, not inferred', () => {
    expect(EDITOR_VIEWER.panelId).toBe('arxhub.editor')
  })

  // Markdown stays readable and editable as text (A-1) and is the plain editor's to open; claiming it
  // here would open every note in a format converter's editor.
  test('markdown is left to the text editor', () => {
    expect(registry().viewerFor('vault/contract.md')).toBeUndefined()
  })

  // The plain text editor claims every extension it can render, this one claims the single format it
  // understands — so the order, not the accident of which plugin configured first, is what decides.
  test('it wins the format it owns against a viewer that merely also reads it', () => {
    const notes = registry()
    notes.registerViewer({
      id: 'test.plain',
      panelId: 'test.plain',
      title: 'Plain',
      extensions: ['.arx', '.md'],
      component: defineComponent({ render: () => null }),
      order: 10,
    })

    expect(notes.viewerFor('vault/contract.arx')?.id).toBe(EDITOR_VIEWER.id)
    expect(notes.viewerFor('vault/contract.md')?.id).toBe('test.plain')
  })
})
