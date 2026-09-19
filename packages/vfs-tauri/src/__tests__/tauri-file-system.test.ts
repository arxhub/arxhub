import { renameEntry } from '@arxhub/vfs'
import { exists as pathExists, readDir, readFile } from '@tauri-apps/plugin-fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// An in-memory stand-in for @tauri-apps/plugin-fs, mocked because the real one only answers inside a
// Tauri window. That absence is why this backend had no tests at all — and why a write that never
// created its parent directory shipped and was found by hand, on the first run of the native app that
// was ever possible on this machine.
//
// It refuses a write below a directory that does not exist, which is what the real plugin does and the
// single behaviour the bug turned on.
const dirs = new Set<string>()
const files = new Map<string, Uint8Array>()

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    const parts = path.split('/')
    if (options?.recursive) {
      for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
      return
    }
    const parent = parts.slice(0, -1).join('/')
    if (parent && !dirs.has(parent)) throw new Error(`ENOENT: ${parent}`)
    dirs.add(path)
  }),
  writeFile: vi.fn(async (path: string, content: Uint8Array) => {
    const parent = path.split('/').slice(0, -1).join('/')
    if (parent && !dirs.has(parent)) throw new Error(`ENOENT: no such directory ${parent}`)
    files.set(path, content)
  }),
  readFile: vi.fn(async (path: string) => {
    const found = files.get(path)
    if (found == null) throw new Error(`ENOENT: ${path}`)
    return found
  }),
  exists: vi.fn(async (path: string) => path === '' || files.has(path) || dirs.has(path)),
  readDir: vi.fn(async (path: string) => {
    if (files.has(path)) throw new Error(`ENOTDIR: ${path}`)
    if (path && !dirs.has(path)) throw new Error(`ENOENT: ${path}`)
    const prefix = path ? `${path}/` : ''
    const names = new Set<string>()
    for (const key of [...files.keys(), ...dirs]) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      if (rest === '' || rest.includes('/')) continue
      names.add(rest)
    }
    return [...names].map((name) => ({ name, isDirectory: dirs.has(prefix + name), isFile: files.has(prefix + name) }))
  }),
  remove: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    // The real plugin throws on a path that is not there — which is what `force` exists to swallow.
    const had = files.delete(path) || dirs.delete(path)
    let removed = had
    if (options?.recursive) {
      for (const key of [...files.keys(), ...dirs]) {
        if (key.startsWith(`${path}/`)) {
          files.delete(key)
          dirs.delete(key)
          removed = true
        }
      }
    }
    if (!removed) throw new Error(`ENOENT: ${path}`)
  }),
  stat: vi.fn(async (path: string) => {
    if (path && !files.has(path) && !dirs.has(path)) throw new Error(`ENOENT: ${path}`)
    return {
      isFile: files.has(path),
      isDirectory: path === '' || dirs.has(path),
      size: files.get(path)?.length ?? 0,
      mtime: new Date(0),
      birthtime: new Date(0),
    }
  }),
}))

const { TauriFileSystem } = await import('../tauri-file-system')

const logger = { child: () => logger, warn: () => {}, info: () => {}, error: () => {}, debug: () => {} } as never

function makeFs(basePath = '') {
  return new TauriFileSystem(basePath, 1 as never, logger)
}

describe('TauriFileSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dirs.clear()
    files.clear()
  })

  it('keeps a missing read compatible with VirtualFile default values', async () => {
    await expect(makeFs().file('missing.json').readJSON({ fresh: true })).resolves.toEqual({ fresh: true })
  })

  it('keeps a refused read distinguishable from a missing file', async () => {
    const fs = makeFs()
    await fs.write('budget.jsonl', new Uint8Array([1]))
    const cause = new Error('permission refused')
    vi.mocked(readFile).mockRejectedValueOnce(cause)

    await expect(fs.read('budget.jsonl')).rejects.toMatchObject({
      body: { code: 'InternalServerError', statusCode: 500, message: "Could not read 'budget.jsonl'" },
      originalError: cause,
    })
  })

  it('surfaces an exists failure as an AppError instead of guessing that a failed read is missing', async () => {
    const fs = makeFs()
    vi.mocked(readFile).mockRejectedValueOnce(new Error('read failed'))
    const cause = new Error('exists IPC failed')
    vi.mocked(pathExists).mockRejectedValueOnce(cause)

    await expect(fs.read('budget.jsonl')).rejects.toMatchObject({
      body: { code: 'InternalServerError', statusCode: 500, message: "Could not check 'budget.jsonl' after it failed to read" },
      originalError: cause,
    })
  })

  it('walks an individual file and keeps its logical path under a native base directory', async () => {
    const fs = makeFs('root')
    await fs.file('notes/page.arx').writeText('Original contents')
    const found = []
    for await (const file of fs.walk('notes/page.arx')) found.push([file.pathname, await file.readText()])
    expect(found).toEqual([['notes/page.arx', 'Original contents']])
    expect(await fs.list('notes/missing.arx')).toEqual([])
  })

  it('moves a single file through the generic copy-delete rename without losing its content', async () => {
    const fs = makeFs('root')
    await fs.file('source.arx').writeText('Keep the note')
    await renameEntry(fs, 'source.arx', 'folder/destination.arx')
    expect(await fs.file('folder/destination.arx').readText()).toBe('Keep the note')
    expect(await fs.exists('source.arx')).toBe(false)
  })

  it('keeps an unreadable folder distinguishable from an empty or absent one', async () => {
    const fs = makeFs()
    await fs.write('notes/a.arx', new Uint8Array([1]))
    vi.mocked(readDir).mockRejectedValueOnce(new Error('EACCES: notes'))
    await expect(fs.list('notes')).rejects.toThrow('EACCES')
    expect(await fs.list('missing')).toEqual([])
  })

  it('creates the directory a write lands in', async () => {
    // The VFS has no mkdir: a folder exists because a file in it does. A backend that does not create
    // the parent cannot write anything below the root, which is what broke saving the theme.
    await makeFs().write('storage/theme/config.toml', new Uint8Array([1]))

    expect(files.has('storage/theme/config.toml')).toBe(true)
    expect(dirs.has('storage/theme')).toBe(true)
  })

  it('creates a folder the way the explorer does — by writing its .keep', async () => {
    // plugins/explorer writes `<folder>/.keep` and calls that a new folder, so this exact path is what
    // "New folder" is in the native app.
    await makeFs().write('vault/new-folder/.keep', new Uint8Array())

    expect(dirs.has('vault/new-folder')).toBe(true)
  })

  it('creates every level, not just the last', async () => {
    await makeFs().write('a/b/c/d.txt', new Uint8Array([2]))

    expect([...dirs].sort()).toEqual(['a', 'a/b', 'a/b/c'])
  })

  it('takes the base path into account when creating the parent', async () => {
    await makeFs('root').write('notes/a.md', new Uint8Array([3]))

    expect(dirs.has('root/notes')).toBe(true)
    expect(files.has('root/notes/a.md')).toBe(true)
  })

  it('writes a file at the root without creating a directory called "."', async () => {
    // `posix.dirname('a.txt')` is '.', and creating that literally would leave a stray directory.
    await makeFs().write('a.txt', new Uint8Array([4]))

    expect(files.has('a.txt')).toBe(true)
    expect(dirs.size).toBe(0)
  })

  it('gives a stream the same parent its direct write would get', async () => {
    const stream = await makeFs().writable('deep/inside/stream.txt')
    const writer = stream.getWriter()
    await writer.write(new Uint8Array([5]))
    await writer.close()

    expect(dirs.has('deep/inside')).toBe(true)
    expect(files.get('deep/inside/stream.txt')).toEqual(new Uint8Array([5]))
  })
  it('lists files and keeps directories', async () => {
    const fs = makeFs()
    await fs.write('notes/a.md', new Uint8Array([1]))
    await fs.write('notes/deep/b.md', new Uint8Array([3]))

    const listed = (await fs.list('notes')).map((it) => it.pathname).sort()

    expect(listed).toEqual(['notes/a.md', 'notes/deep'])
  })

  it('does not hide dot-prefixed files such as .keep', async () => {
    const fs = makeFs()
    await fs.write('vault/sub/.keep', new Uint8Array())

    const listed = (await fs.list('vault/sub')).map((it) => it.pathname)
    expect(listed).toEqual(['vault/sub/.keep'])
  })

  it('round-trips through a stream the way a direct write does', async () => {
    const fs = makeFs()
    await fs.write('notes/direct.md', new TextEncoder().encode('hello'))

    expect(new TextDecoder().decode(await fs.read('notes/direct.md'))).toBe('hello')
  })

  it('answers a missing file with fileNotFound rather than the backend error', async () => {
    // A caller distinguishes "not there" from "the store is broken"; leaking the plugin's own message
    // would make every absent file look like a failure of the file system.
    await expect(makeFs().read('nowhere.md')).rejects.toThrow(/nowhere\.md/)
    await expect(makeFs().head('nowhere.md')).rejects.toThrow(/nowhere\.md/)
  })

  it('says a file is there only when it is', async () => {
    const fs = makeFs()
    expect(await fs.exists('notes/a.md')).toBe(false)
    await fs.write('notes/a.md', new Uint8Array([1]))
    expect(await fs.exists('notes/a.md')).toBe(true)
  })

  it('reports what it knows about a file', async () => {
    const fs = makeFs()
    await fs.write('notes/a.md', new Uint8Array([1, 2, 3]))

    const head = await fs.head('notes/a.md')
    expect(head.size).toBe(3)
    expect(typeof head.modifiedAt).toBe('number')
  })

  it('a forced delete of something absent is not a failure', async () => {
    // `force` is what makes a delete idempotent, and the sweep after a failed write relies on it.
    await expect(makeFs().delete('nowhere.md', { force: true })).resolves.toBeUndefined()
    await expect(makeFs().delete('nowhere.md')).rejects.toThrow(/nowhere\.md/)
  })
})
