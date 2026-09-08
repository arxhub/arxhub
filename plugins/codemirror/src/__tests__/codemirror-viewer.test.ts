import { ConsoleLogger } from '@arxhub/logger'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { CODEMIRROR_VIEWER } from '../codemirror-plugin'

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
  notes.registerViewer(CODEMIRROR_VIEWER)
  return notes
}

describe('codemirror as a viewer of a note', () => {
  test('markdown and plain text are answered', () => {
    const notes = registry()

    for (const path of ['vault/contract.md', 'vault/contract.markdown', 'vault/notes.txt']) {
      expect(notes.viewerFor(path)?.id, path).toBe(CODEMIRROR_VIEWER.id)
    }
  })

  test('code is answered too — the same editor, since the formatting bar is the note-only part', () => {
    const notes = registry()

    for (const path of ['src/main.ts', 'src/App.tsx', 'package.json', 'config.toml', 'style.css', 'run.sh', 'lib.rs']) {
      expect(notes.viewerFor(path)?.id, path).toBe(CODEMIRROR_VIEWER.id)
    }
  })

  // The lookup the tree and search go through folds the case; the panel store's own match did not, so
  // a note saved as 'README.MD' used to be a file nothing could open.
  test('the case the name was written in does not decide whether it opens', () => {
    const notes = registry()

    for (const path of ['vault/README.md', 'vault/README.MD', 'vault/Notes.TXT', 'src/Main.TS']) {
      expect(notes.viewerFor(path)?.id, path).toBe(CODEMIRROR_VIEWER.id)
    }
  })

  // The string the panel store was registered under: openers pass `panelId`, so a change here that did
  // not reach `registerPanel` would open nothing.
  test('the panel it opens through is named, not inferred', () => {
    expect(CODEMIRROR_VIEWER.panelId).toBe('arxhub.codemirror.editor')
  })

  // The document format has its own viewer, and two viewers claiming '.arx' would make which one opens
  // it depend on the order plugins happen to configure in.
  test('the document format is left to the document editor', () => {
    expect(registry().viewerFor('vault/contract.arx')).toBeUndefined()
  })

  test('a format nothing here reads is answered with nothing, not with a text editor', () => {
    const notes = registry()

    expect(notes.viewerFor('vault/scan.pdf')).toBeUndefined()
    expect(notes.viewerFor('vault/photo.png')).toBeUndefined()
    expect(notes.viewerFor('vault/LICENSE')).toBeUndefined()
  })
})
