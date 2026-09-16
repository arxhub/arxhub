import { illegalState } from '@arxhub/errors'
import { ConsoleLogger } from '@arxhub/logger'
import { normalizePath } from '@arxhub/path'
import { type FileHead, GenericVirtualFileSystem, type VirtualEntry } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { ExplorerExtension } from '../explorer-extension'
import type { ImportSource } from '../import-files'

// A flat in-memory backend, small enough to state what each test needs and nothing else. `writable`
// records the chunks it was handed, so a test can tell a streamed write from a whole-file one — which
// is the property the import exists to have.
class MemoryVfs extends GenericVirtualFileSystem {
  readonly files = new Map<string, string>()
  readonly chunkCounts = new Map<string, number>()
  failWritesTo: string | null = null

  override async list(prefix: string): Promise<VirtualEntry[]> {
    const base = normalizePath(prefix)
    const dirPrefix = base === '' ? '' : `${base}/`
    return [...this.files.keys()]
      .filter((key) => key.startsWith(dirPrefix) && !key.slice(dirPrefix.length).includes('/'))
      .map((pathname) => ({ kind: 'file', pathname }) as const)
  }

  override async read(pathname: string): Promise<Uint8Array> {
    return new TextEncoder().encode(this.files.get(normalizePath(pathname)) ?? '')
  }

  override async readable(): Promise<ReadableStream<Uint8Array>> {
    throw illegalState('not needed by these tests')
  }

  override async write(pathname: string, content: Uint8Array): Promise<void> {
    this.files.set(normalizePath(pathname), new TextDecoder().decode(content))
  }

  override async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const key = normalizePath(pathname)
    if (this.failWritesTo === key) throw illegalState(`the vault refused ${key}`)
    const parts: string[] = []
    const { files, chunkCounts } = this
    return new WritableStream<Uint8Array>({
      write(chunk) {
        parts.push(new TextDecoder().decode(chunk))
      },
      close() {
        files.set(key, parts.join(''))
        chunkCounts.set(key, parts.length)
      },
    })
  }

  override async delete(): Promise<void> {
    throw illegalState('not needed by these tests')
  }

  override async exists(pathname: string): Promise<boolean> {
    return this.files.has(normalizePath(pathname))
  }

  override async head(): Promise<FileHead> {
    throw illegalState('not needed by these tests')
  }
}

// A picked file: the shape the browser's own `File` already has, handed over in several chunks so a
// test can see whether the import passed them through or collapsed them first.
function picked(name: string, chunks: readonly string[]): ImportSource {
  return {
    name,
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
          controller.close()
        },
      }),
  }
}

function explorerOver(vfs: MemoryVfs): ExplorerExtension {
  return new ExplorerExtension({ logger: new ConsoleLogger(), vfs, root: '/' })
}

describe('importFiles', () => {
  test('copies what was picked into the given folder and says where it landed', async () => {
    const vfs = new MemoryVfs()
    const explorer = explorerOver(vfs)

    const added = await explorer.importFiles('/trip', [picked('photo.jpg', ['bytes'])])

    expect(added).toEqual([{ name: 'photo.jpg', path: '/trip/photo.jpg' }])
    expect(vfs.files.get('trip/photo.jpg')).toBe('bytes')
  })

  // The whole reason the port takes a stream: a picked file can be a film, and nothing on this road may
  // hold it in one piece.
  test('passes the source through chunk by chunk rather than reading it whole', async () => {
    const vfs = new MemoryVfs()
    const explorer = explorerOver(vfs)

    await explorer.importFiles('/', [picked('clip.mp4', ['one', 'two', 'three'])])

    expect(vfs.chunkCounts.get('clip.mp4')).toBe(3)
  })

  test('a taken name is never overwritten — the copy lands beside it', async () => {
    const vfs = new MemoryVfs()
    vfs.files.set('photo.jpg', 'the one that was already there')
    const explorer = explorerOver(vfs)

    const added = await explorer.importFiles('/', [picked('photo.jpg', ['new'])])

    expect(added).toEqual([{ name: 'photo.jpg', path: '/photo 2.jpg' }])
    expect(vfs.files.get('photo.jpg')).toBe('the one that was already there')
  })

  // Two files of ONE gesture can carry the same name. A name checked before the previous write landed
  // would be handed out twice, and the second copy would eat the first.
  test('two picked files with one name both survive', async () => {
    const vfs = new MemoryVfs()
    const explorer = explorerOver(vfs)

    const added = await explorer.importFiles('/', [picked('note.txt', ['first']), picked('note.txt', ['second'])])

    expect(added.map((file) => file.path)).toEqual(['/note.txt', '/note 2.txt'])
    expect(vfs.files.get('note.txt')).toBe('first')
    expect(vfs.files.get('note 2.txt')).toBe('second')
  })

  test('one refused write does not cost the rest of the set, and is reported with what did land', async () => {
    const vfs = new MemoryVfs()
    vfs.failWritesTo = 'bad.txt'
    const explorer = explorerOver(vfs)

    await expect(explorer.importFiles('/', [picked('ok.txt', ['a']), picked('bad.txt', ['b']), picked('also-ok.txt', ['c'])])).rejects.toThrow(
      'bad.txt could not be written — 2 of 3 were added.',
    )
    expect(vfs.files.get('ok.txt')).toBe('a')
    expect(vfs.files.get('also-ok.txt')).toBe('c')
  })

  test('the tree is refreshed once the copies are in, so the new rows are there without a reload', async () => {
    const vfs = new MemoryVfs()
    const explorer = explorerOver(vfs)

    await explorer.importFiles('/', [picked('photo.jpg', ['bytes'])])

    expect(explorer.tree.value.map((node) => node.entry.pathname)).toEqual(['photo.jpg'])
  })
})
