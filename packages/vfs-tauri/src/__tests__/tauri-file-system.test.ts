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
  readDir: vi.fn(async () => []),
  remove: vi.fn(async (path: string) => {
    files.delete(path)
  }),
  stat: vi.fn(async (path: string) => {
    if (!files.has(path)) throw new Error(`ENOENT: ${path}`)
    return { size: files.get(path)?.length ?? 0, mtime: new Date(0), birthtime: new Date(0) }
  }),
}))

const { TauriFileSystem } = await import('../tauri-file-system')

const logger = { child: () => logger, warn: () => {}, info: () => {}, error: () => {}, debug: () => {} } as never

function makeFs(basePath = '') {
  return new TauriFileSystem(basePath, 1 as never, logger)
}

describe('TauriFileSystem', () => {
  beforeEach(() => {
    dirs.clear()
    files.clear()
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
})
