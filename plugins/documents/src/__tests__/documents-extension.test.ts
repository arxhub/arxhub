import { illegalState } from '@arxhub/errors'
import { ConsoleLogger } from '@arxhub/logger'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { DocumentsExtension, type DocumentViewer } from '../documents-extension'

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

function extension(vfs: VirtualFileSystem = fakeVfs(), root = '/'): DocumentsExtension {
  return new DocumentsExtension({ logger: new ConsoleLogger(), vfs, root })
}

function viewer(over: Partial<DocumentViewer> = {}): DocumentViewer {
  return { id: 'v', panelId: 'v.panel', title: 'Viewer', extensions: ['.md'], component: Viewer, ...over }
}

// OR-03: the rule itself is unit-tested in display-name.test.ts; what matters here is that "known" is
// answered by the registry and by the setting, and by nothing else.
describe('displayName', () => {
  test('hides the extension of a file some registered viewer claims', () => {
    const documents = extension()
    documents.registerViewer(viewer({ extensions: ['.md'] }))

    expect(documents.displayName('cases/contract.md')).toMatchObject({ text: 'contract', hiddenExtension: '.md' })
    expect(documents.displayName('cases/scan.png')).toMatchObject({ text: 'scan.png', hiddenExtension: '' })
  })

  test('a viewer that goes away takes the hiding with it', () => {
    const documents = extension()
    documents.registerViewer(viewer({ id: 'md', extensions: ['.md'] }))
    expect(documents.displayName('contract.md').text).toBe('contract')

    documents.unregisterViewer('md')
    expect(documents.displayName('contract.md').text).toBe('contract.md')
  })

  test('with the setting off the whole name shows, extension and all', () => {
    const documents = extension()
    documents.registerViewer(viewer({ extensions: ['.md'] }))
    documents.hideKnownExtensions.value = false

    expect(documents.displayName('contract.md')).toMatchObject({ text: 'contract.md', hiddenExtension: '' })
  })
})

describe('the viewer registry', () => {
  test('a file is matched to a viewer by its extension, case and all', () => {
    const documents = extension()
    documents.registerViewer(viewer({ id: 'md', extensions: ['.MD'] }))

    expect(documents.viewerFor('cases/contract.md')?.id).toBe('md')
    expect(documents.viewerFor('cases/CONTRACT.MD')?.id).toBe('md')
  })

  // The lookup both the tree and search now go through. An extension is not case-sensitive to a person
  // writing a file name, and the store's own exact string match said otherwise: 'README.MD' used to be
  // a file nothing could open.
  test('the case a file name was written in does not decide whether it opens', () => {
    const documents = extension()
    documents.registerViewer(viewer({ id: 'md', extensions: ['.md'] }))

    expect(documents.viewerFor('vault/README.md')?.id).toBe('md')
    expect(documents.viewerFor('vault/README.MD')?.id).toBe('md')
    expect(documents.viewerFor('vault/README.Md')?.id).toBe('md')
    expect(documents.viewerFor('vault/README.rst')).toBeUndefined()
  })

  // `store.openPanel` takes a panel DEFINITION id. Every viewer today carries the same string in both
  // fields, which is exactly why the caller must not read `id` and hope.
  test('a viewer names the panel it opens through, and it is not read off the id', () => {
    const documents = extension()
    documents.registerViewer(viewer({ id: 'md.viewer', panelId: 'md.panel' }))

    expect(documents.viewerFor('note.md')?.panelId).toBe('md.panel')
  })

  test('a file nothing claims has no viewer — and that is an answer, not a throw', () => {
    const documents = extension()
    documents.registerViewer(viewer())

    expect(documents.viewerFor('archive.zip')).toBeUndefined()
    // No extension at all is the same case: there is nothing to match on.
    expect(documents.viewerFor('LICENSE')).toBeUndefined()
  })

  test('order decides which of two viewers of one extension answers', () => {
    const documents = extension()
    documents.registerViewer(viewer({ id: 'late', order: 10 }))
    documents.registerViewer(viewer({ id: 'early', order: 1 }))

    expect(documents.viewerFor('note.md')?.id).toBe('early')
  })

  // Registration happens as plugins configure, and throwing here would mean failing to load the
  // application because two viewers collided on an id.
  test('a repeated id is skipped, and the first registration stays', () => {
    const documents = extension()
    documents.registerViewer(viewer({ id: 'md', title: 'First' }))
    documents.registerViewer(viewer({ id: 'md', title: 'Second' }))

    expect(documents.viewerFor('note.md')?.title).toBe('First')
  })

  test('an unregistered viewer stops answering', () => {
    const documents = extension()
    documents.registerViewer(viewer({ id: 'md' }))
    documents.unregisterViewer('md')

    expect(documents.viewerFor('note.md')).toBeUndefined()
  })
})

describe('creating a note', () => {
  test('a free name is taken when the plain one is', async () => {
    const documents = extension(fakeVfs({ taken: ['/New note.md', '/New note 2.md'] }))

    expect(await documents.freePath('/', 'New note', '.md')).toBe('/New note 3.md')
  })

  // An unreadable name is not a free name: guessing here could overwrite an existing note.
  test('a failing existence check prevents choosing a possibly occupied name', async () => {
    const documents = extension(fakeVfs({ existsThrows: true }))

    await expect(documents.freePath('/', 'New note', '.md')).rejects.toThrow('unreachable')
  })

  test('without a creator the note is written into the type’s own root', async () => {
    const written: string[] = []
    const documents = extension(fakeVfs({ written }), '/vault')

    expect(await documents.createDocument()).toBe('/vault/New note.md')
    expect(written).toEqual(['/vault/New note.md'])
  })

  // The explorer knows the place better — it has a selected folder and a tree to refresh — so it takes
  // creation over. Nothing is written by the extension in that case.
  test('a registered creator takes over entirely', async () => {
    const written: string[] = []
    const documents = extension(fakeVfs({ written }))
    documents.setCreator(async () => 'cases/New note.md')

    expect(await documents.createDocument()).toBe('cases/New note.md')
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

describe('renaming an open object', () => {
  // The backend declares the capability, so the rename is one call rather than a copy-then-delete —
  // and what the test watches is that the extension hands it the path the rule computed.
  function renamingVfs(opts: { taken?: readonly string[] } = {}): { vfs: VirtualFileSystem; renames: string[][] } {
    const renames: string[][] = []
    const vfs = fakeVfs(opts) as VirtualFileSystem & { rename(src: string, dest: string): Promise<void> }
    vfs.rename = async (src, dest) => {
      renames.push([src, dest])
    }
    return { vfs, renames }
  }

  test('the new name lands in the file’s own directory', async () => {
    const { vfs, renames } = renamingVfs()
    const documents = extension(vfs)

    expect(await documents.renameObject('cases/draft.md', 'contract.md')).toBe('cases/contract.md')
    expect(renames).toEqual([['cases/draft.md', 'cases/contract.md']])
  })

  // Re-typing the same name is a no-op rather than a write: a rename that rewrote the file would cost
  // a sync round and a new manifest entry for nothing.
  test('the same name writes nothing', async () => {
    const { vfs, renames } = renamingVfs()
    const documents = extension(vfs)

    expect(await documents.renameObject('cases/draft.md', 'draft.md')).toBe('cases/draft.md')
    expect(renames).toEqual([])
  })

  test('a name already taken in that directory is refused, not overwritten', async () => {
    const { vfs, renames } = renamingVfs({ taken: ['cases/contract.md'] })
    const documents = extension(vfs)

    await expect(documents.renameObject('cases/draft.md', 'contract.md')).rejects.toThrow('already here')
    expect(renames).toEqual([])
  })

  test('a name carrying a separator never reaches the vault', async () => {
    const { vfs, renames } = renamingVfs()
    const documents = extension(vfs)

    await expect(documents.renameObject('cases/draft.md', '../contract.md')).rejects.toThrow(/slash/)
    expect(renames).toEqual([])
  })
})

describe('the view bar', () => {
  test('answers the bar of the view open on that path, and nothing once it unmounts', () => {
    const documents = extension()
    const unregister = documents.registerViewBar(
      () => 'a.arx',
      () => ({ sub: 'Saving…' }),
    )

    expect(documents.viewBar('a.arx')).toEqual({ sub: 'Saving…' })
    expect(documents.viewBar('b.arx')).toBeNull()

    unregister()
    expect(documents.viewBar('a.arx')).toBeNull()
  })

  test('follows the view to its new path after a rename', () => {
    const documents = extension()
    let path = 'a.arx'
    documents.registerViewBar(
      () => path,
      () => ({ sub: 'Read only' }),
    )

    path = 'b.arx'
    expect(documents.viewBar('a.arx')).toBeNull()
    expect(documents.viewBar('b.arx')).toEqual({ sub: 'Read only' })
  })
})
