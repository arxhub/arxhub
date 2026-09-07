import { illegalState } from '@arxhub/errors'
import { ConsoleLogger } from '@arxhub/logger'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { NotesExtension, type NoteViewer } from '../notes-extension'

const Viewer = defineComponent({ name: 'Viewer', render: () => null })

// Only the two methods the extension is allowed to reach for are real; everything else throws, which
// is what proves the rest of the VFS is not touched.
function fakeVfs(opts: { taken?: readonly string[]; existsThrows?: boolean; written?: string[] } = {}): VirtualFileSystem {
  const fail = (): never => {
    throw illegalState('vfs should not be called by this test')
  }
  const taken = new Set(opts.taken ?? [])
  return {
    file: (path: string) =>
      ({
        writeText: async (): Promise<void> => {
          opts.written?.push(path)
          taken.add(path)
        },
      }) as unknown as VirtualFile,
    exists: async (path: string) => {
      if (opts.existsThrows === true) throw illegalState('the vault is unreachable')
      return taken.has(path)
    },
    dir: fail,
    list: fail,
    walk: fail,
    read: fail,
    readable: fail,
    write: fail,
    writable: fail,
    delete: fail,
    head: fail,
    lock: fail,
    acquireLock: fail,
  } as unknown as VirtualFileSystem
}

function extension(vfs: VirtualFileSystem = fakeVfs(), root = '/'): NotesExtension {
  return new NotesExtension({ logger: new ConsoleLogger(), vfs, root })
}

function viewer(over: Partial<NoteViewer> = {}): NoteViewer {
  return { id: 'v', title: 'Viewer', extensions: ['.md'], component: Viewer, ...over }
}

describe('the viewer registry', () => {
  test('a file is matched to a viewer by its extension, case and all', () => {
    const notes = extension()
    notes.registerViewer(viewer({ id: 'md', extensions: ['.MD'] }))

    expect(notes.viewerFor('cases/contract.md')?.id).toBe('md')
    expect(notes.viewerFor('cases/CONTRACT.MD')?.id).toBe('md')
  })

  test('a file nothing claims has no viewer — and that is an answer, not a throw', () => {
    const notes = extension()
    notes.registerViewer(viewer())

    expect(notes.viewerFor('archive.zip')).toBeUndefined()
    // No extension at all is the same case: there is nothing to match on.
    expect(notes.viewerFor('LICENSE')).toBeUndefined()
  })

  test('order decides which of two viewers of one extension answers', () => {
    const notes = extension()
    notes.registerViewer(viewer({ id: 'late', order: 10 }))
    notes.registerViewer(viewer({ id: 'early', order: 1 }))

    expect(notes.viewerFor('note.md')?.id).toBe('early')
  })

  // Registration happens as plugins configure, and throwing here would mean failing to load the
  // application because two viewers collided on an id.
  test('a repeated id is skipped, and the first registration stays', () => {
    const notes = extension()
    notes.registerViewer(viewer({ id: 'md', title: 'First' }))
    notes.registerViewer(viewer({ id: 'md', title: 'Second' }))

    expect(notes.viewerFor('note.md')?.title).toBe('First')
  })

  test('an unregistered viewer stops answering', () => {
    const notes = extension()
    notes.registerViewer(viewer({ id: 'md' }))
    notes.unregisterViewer('md')

    expect(notes.viewerFor('note.md')).toBeUndefined()
  })
})

describe('creating a note', () => {
  test('a free name is taken when the plain one is', async () => {
    const notes = extension(fakeVfs({ taken: ['/New note.md', '/New note 2.md'] }))

    expect(await notes.freePath('/', 'New note', '.md')).toBe('/New note 3.md')
  })

  // The check is about the name, not about the right to write: a vault that will not answer must not
  // stop a note from being created.
  test('a failing existence check does not stop the creation', async () => {
    const notes = extension(fakeVfs({ existsThrows: true }))

    expect(await notes.freePath('/', 'New note', '.md')).toBe('/New note.md')
  })

  test('without a creator the note is written into the type’s own root', async () => {
    const written: string[] = []
    const notes = extension(fakeVfs({ written }), '/vault')

    expect(await notes.createNote()).toBe('/vault/New note.md')
    expect(written).toEqual(['/vault/New note.md'])
  })

  // The explorer knows the place better — it has a selected folder and a tree to refresh — so it takes
  // creation over. Nothing is written by the extension in that case.
  test('a registered creator takes over entirely', async () => {
    const written: string[] = []
    const notes = extension(fakeVfs({ written }))
    notes.setCreator(async () => 'cases/New note.md')

    expect(await notes.createNote()).toBe('cases/New note.md')
    expect(written).toEqual([])
  })
})

describe('whether the object is still there', () => {
  test('a missing file is gone', async () => {
    expect(await extension(fakeVfs()).stillThere('gone.md')).toBe(false)
  })

  // A dropped network is not a deleted file, and a marked tab would say exactly that it was deleted.
  test('an unreachable vault is not an answer of "gone"', async () => {
    expect(await extension(fakeVfs({ existsThrows: true })).stillThere('cases/contract.md')).toBe(true)
  })
})
