import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validation } from '@arxhub/errors'
import type { LogFn, Logger } from '@arxhub/logger'
import { ScopedFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createIndexer, type Indexer, SCAN_CURSOR_KEY } from '../indexer'
import { openSqlIndex } from '../pglite-index'
import type { SqlIndex } from '../types'

// One PGlite for the whole file (a cold one costs about a second) and one temp tree per test, emptied
// between them.
let index: SqlIndex
let rootDir: string
let root: VirtualFileSystem
let vault: VirtualFileSystem

const encoder = new TextEncoder()

class CapturingLogger implements Logger {
  readonly records: { level: string; args: unknown[] }[] = []

  private capture(level: string): LogFn {
    return (...args: unknown[]) => {
      this.records.push({ level, args })
    }
  }

  debug = this.capture('debug')
  info = this.capture('info')
  warn = this.capture('warn')
  error = this.capture('error')

  child(): Logger {
    return this
  }
}

// The real Node backend with one path that refuses to be read — the way a file that cannot be parsed
// reaches the walk. A decorator rather than a fake filesystem: everything else here is the real thing.
class UnreadableFileVault extends ScopedFileSystem {
  private readonly unreadable: string

  constructor(inner: VirtualFileSystem, prefix: string, unreadable: string) {
    super(inner, prefix)
    this.unreadable = unreadable
  }

  override async read(pathname: string): Promise<Uint8Array> {
    if (pathname === this.unreadable) throw validation(`refusing to read ${pathname}`)
    return super.read(pathname)
  }
}

let logger: CapturingLogger

function indexer(vfs: VirtualFileSystem = vault, options: { batchSize?: number; exclude?: string[]; maxFileSize?: number } = {}): Indexer {
  return createIndexer(index, vfs, { logger, ...options })
}

async function writeNote(path: string, lines: readonly string[], mtimeMs = 1_700_000_000_000): Promise<void> {
  await vault.write(path, encoder.encode(lines.join('\n')))
  // The filesystem's own timestamp has millisecond granularity, so two writes in the same tick can
  // share one. Setting it explicitly is what makes the freshness checks below mean something.
  const stamp = new Date(mtimeMs)
  await fs.utimes(join(rootDir, 'vault', path), stamp, stamp)
}

async function rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  const result = await index.query<R>(sql, params)
  return result.rows
}

async function documentPaths(): Promise<string[]> {
  return (await rows<{ path: string }>('SELECT path FROM document ORDER BY path')).map((row) => row.path)
}

beforeAll(async () => {
  index = await openSqlIndex({ dataDir: 'memory://' })
  rootDir = await fs.mkdtemp(join(tmpdir(), 'arxhub-sql-indexer-'))
  root = new NodeFileSystem(rootDir, new CapturingLogger())
  vault = new ScopedFileSystem(root, 'vault')
})

afterAll(async () => {
  await index.close()
  await fs.rm(rootDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await index.exec('DELETE FROM document')
  await index.query('DELETE FROM index_meta WHERE key <> $1', ['schema_version'])
  await fs.rm(rootDir, { recursive: true, force: true })
  await fs.mkdir(join(rootDir, 'vault'), { recursive: true })
  logger = new CapturingLogger()
})

describe('scan', () => {
  it('indexes the content store and nothing else', async () => {
    await writeNote('notes/example.md', ['# Заметка'])
    await vault.write('notes/.keep', new Uint8Array())
    await vault.write('notes/example.md.arxmeta', encoder.encode('{}'))
    // A plugin's own bucket lives next to the content store, not inside it.
    await root.write('storage/search/state.json', encoder.encode('{}'))

    const status = await indexer().scan()

    expect(await documentPaths()).toEqual(['notes/example.md'])
    expect(status.state).toBe('idle')
    expect(status.documentCount).toBe(1)
    expect(status.lastScanFinishedAt).toBeInstanceOf(Date)
  })

  it('honours the exclude masks and indexes an oversized file by its metadata alone', async () => {
    await writeNote('notes/keep.md', ['# Keep'])
    await writeNote('drafts/skip.md', ['# Skip'])
    await writeNote('notes/huge.md', ['# Huge', '', 'x'.repeat(200)])

    await indexer(vault, { exclude: ['drafts/'], maxFileSize: 64 }).scan()

    expect(await documentPaths()).toEqual(['notes/huge.md', 'notes/keep.md'])
    const [huge] = await rows<{ content: string; blocks: number }>(
      `SELECT content, (SELECT count(*)::int FROM block WHERE doc_path = 'notes/huge.md') AS blocks FROM document WHERE path = 'notes/huge.md'`,
    )
    expect(huge).toEqual({ content: '', blocks: 0 })
  })

  it('leaves an unchanged file alone on the next walk', async () => {
    await writeNote('notes/example.md', ['# Заметка'])
    await indexer().scan()
    const [first] = await rows<{ indexed_at: string }>('SELECT indexed_at::text AS indexed_at FROM document')

    await indexer().scan()

    const [second] = await rows<{ indexed_at: string }>('SELECT indexed_at::text AS indexed_at FROM document')
    expect(second.indexed_at).toBe(first.indexed_at)
  })

  it('does not parse a file again when only its timestamp moved', async () => {
    await writeNote('notes/example.md', ['# Заметка', '', 'Текст.'])
    await indexer().scan()
    // If the file were parsed again this row would come back; the hash says the content is the same, so
    // only the stat fields are written.
    await index.query('DELETE FROM block WHERE ordinal = 1')
    await writeNote('notes/example.md', ['# Заметка', '', 'Текст.'], 1_700_000_100_000)

    await indexer().scan()

    expect(await rows<{ ordinal: number }>('SELECT ordinal FROM block ORDER BY ordinal')).toEqual([{ ordinal: 0 }])
    const [document] = await rows<{ mtime: number }>('SELECT mtime::float8 AS mtime FROM document')
    expect(Number(document.mtime)).toBe(1_700_000_100_000)
  })

  it('reindexes a changed file and keeps nothing of the previous version', async () => {
    await writeNote('notes/example.md', ['# Старое', '', 'Абзац с #старым и [[старая цель]].'])
    await indexer().scan()
    await writeNote('notes/example.md', ['# Новое'], 1_700_000_200_000)

    await indexer().scan()

    expect(await rows<{ content: string }>('SELECT content FROM block ORDER BY ordinal')).toEqual([{ content: 'Новое' }])
    expect(await rows('SELECT 1 FROM tag')).toEqual([])
    expect(await rows('SELECT 1 FROM ref')).toEqual([])
  })

  it('drops a document whose file is gone, with its blocks, tags and links', async () => {
    await writeNote('notes/gone.md', ['# Уйдёт', '', 'Абзац с #тегом и [[цель]].'])
    await writeNote('notes/stays.md', ['# Останется'])
    await indexer().scan()
    await vault.delete('notes/gone.md', { force: true })

    await indexer().scan()

    expect(await documentPaths()).toEqual(['notes/stays.md'])
    expect(await rows('SELECT 1 FROM block WHERE doc_path = $1', ['notes/gone.md'])).toEqual([])
    expect(await rows('SELECT 1 FROM tag')).toEqual([])
    expect(await rows('SELECT 1 FROM ref')).toEqual([])
  })

  it('carries on past a file it cannot read, and says so in the log', async () => {
    await writeNote('notes/good.md', ['# Хорошая'])
    await writeNote('notes/bad.md', ['# Плохая'])
    const failing = new UnreadableFileVault(root, 'vault', 'notes/bad.md')

    const status = await indexer(failing).scan()

    expect(await documentPaths()).toEqual(['notes/bad.md', 'notes/good.md'])
    expect(status.processed).toBe(2)
    // The unreadable one is in the index by its metadata, with nothing read out of it.
    const [bad] = await rows<{ content: string; blocks: number }>(
      `SELECT content, (SELECT count(*)::int FROM block WHERE doc_path = 'notes/bad.md') AS blocks FROM document WHERE path = 'notes/bad.md'`,
    )
    expect(bad).toEqual({ content: '', blocks: 0 })
    expect(logger.records.some((record) => record.level === 'warn')).toBe(true)
  })

  it('reports scanning while it walks and idle when it is done', async () => {
    await writeNote('notes/a.md', ['# A'])
    await writeNote('notes/b.md', ['# B'])
    const walk = indexer(vault, { batchSize: 1 })
    const seen: string[] = []
    walk.subscribe((status) => seen.push(status.state))

    await walk.scan()

    expect(seen[0]).toBe('scanning')
    expect(seen.at(-1)).toBe('idle')
    expect(walk.status).toEqual(expect.objectContaining({ state: 'idle', processed: 2, documentCount: 2 }))
  })

  it('does not start a second walk while one is running', async () => {
    for (let i = 0; i < 6; i++) await writeNote(`notes/note-${i}.md`, [`# Note ${i}`])
    const walk = indexer(vault, { batchSize: 1 })

    const first = walk.scan()
    const second = walk.scan()
    expect(second).toBe(first)

    const status = await first
    expect(status.processed).toBe(6)
    expect(status.documentCount).toBe(6)
  })

  it('saves its cursor when it is cancelled and resumes from there', async () => {
    for (let i = 0; i < 6; i++) await writeNote(`notes/note-${i}.md`, [`# Note ${i}`])
    const walk = indexer(vault, { batchSize: 1 })
    walk.subscribe((status) => {
      if (status.processed === 2) walk.cancel()
    })

    const cancelled = await walk.scan()
    expect(cancelled.processed).toBeLessThan(6)
    expect(cancelled.lastScanFinishedAt).toBeNull()
    const [cursor] = await rows<{ value: string }>('SELECT value FROM index_meta WHERE key = $1', [SCAN_CURSOR_KEY])
    expect(cursor.value).not.toBe('')

    const resumed = await indexer().scan()

    expect(resumed.documentCount).toBe(6)
    // A resumed walk reads only the tail, so it must not have re-read everything.
    expect(resumed.processed).toBeLessThan(6)
    const [after] = await rows<{ value: string }>('SELECT value FROM index_meta WHERE key = $1', [SCAN_CURSOR_KEY])
    expect(after.value).toBe('')
  })

  it('finishes on an empty content store', async () => {
    const status = await indexer().scan()
    expect(status).toEqual(expect.objectContaining({ state: 'idle', processed: 0, documentCount: 0 }))
  })
})

describe('reindex', () => {
  it('builds the index again from the content store', async () => {
    await writeNote('notes/a.md', ['# A'])
    await writeNote('notes/b.md', ['# B'])
    await indexer().scan()
    // A row from an earlier state of the store: nothing in the content store answers for it.
    await index.query(
      `INSERT INTO document (path, name, dir, ext, kind, title, title_fold, size, mtime, ctime)
       VALUES ('notes/stale.md', 'stale.md', 'notes', 'md', 'markdown', 'Stale', 'stale', 0, 0, 0)`,
    )

    const status = await indexer().reindex()

    expect(await documentPaths()).toEqual(['notes/a.md', 'notes/b.md'])
    expect(status.documentCount).toBe(2)
    expect(status.processed).toBe(2)
  })
})

describe('indexPath and removePath', () => {
  it('indexes one file that was just written', async () => {
    await writeNote('notes/example.md', ['# Заметка'])
    const walk = indexer()

    await walk.indexPath('notes/example.md')

    expect(await documentPaths()).toEqual(['notes/example.md'])
    expect(walk.status.documentCount).toBe(1)
  })

  it('reindexes a file the walk would have skipped as unchanged', async () => {
    await writeNote('notes/example.md', ['# Первое'])
    const walk = indexer()
    await walk.indexPath('notes/example.md')
    // Same size, same timestamp, different content — a walk would skip it, an explicit write must not.
    await writeNote('notes/example.md', ['# Второе'])

    await walk.indexPath('notes/example.md')

    expect(await rows<{ content: string }>('SELECT content FROM block')).toEqual([{ content: 'Второе' }])
  })

  it('takes a file that is no longer there out of the index', async () => {
    await writeNote('notes/example.md', ['# Заметка'])
    const walk = indexer()
    await walk.indexPath('notes/example.md')
    await vault.delete('notes/example.md', { force: true })

    await walk.indexPath('notes/example.md')

    expect(await documentPaths()).toEqual([])
  })

  it('ignores a path that never becomes a document', async () => {
    await vault.write('notes/.keep', new Uint8Array())
    const walk = indexer()

    await walk.indexPath('notes/.keep')

    expect(await documentPaths()).toEqual([])
  })

  it('removes a document by path', async () => {
    await writeNote('notes/example.md', ['# Заметка'])
    const walk = indexer()
    await walk.indexPath('notes/example.md')

    await walk.removePath('notes/example.md')

    expect(await documentPaths()).toEqual([])
    expect(walk.status.documentCount).toBe(0)
  })

  // A deleted folder is reported once, on the folder's own path — there is no per-file change to react
  // to, and the files are already gone, so nothing can be re-read to find out what was in there.
  it('removes everything under a folder that was deleted', async () => {
    await writeNote('notes/archive/one.md', ['# Один'])
    await writeNote('notes/archive/deep/two.md', ['# Два'])
    await writeNote('notes/keep.md', ['# Оставить'])
    const walk = indexer()
    await walk.scan()
    await vault.delete('notes/archive', { recursive: true, force: true })

    await walk.removePath('notes/archive')

    expect(await documentPaths()).toEqual(['notes/keep.md'])
    expect(walk.status.documentCount).toBe(1)
  })
})

describe('configure', () => {
  it('changes what the next walk covers without building a second indexer', async () => {
    await writeNote('notes/keep.md', ['# Keep'])
    await writeNote('drafts/skip.md', ['# Skip'])
    const walk = indexer()
    await walk.scan()
    expect(await documentPaths()).toEqual(['drafts/skip.md', 'notes/keep.md'])

    // What the settings section does when the owner saves a new exclude list: the rule goes live, and the
    // rebuild is what drops the rows the previous rule admitted.
    walk.configure({ exclude: ['drafts/'] })
    await walk.reindex()

    expect(await documentPaths()).toEqual(['notes/keep.md'])
  })

  it('leaves a tunable alone when the call does not mention it', async () => {
    await writeNote('notes/huge.md', ['# Huge', '', 'x'.repeat(200)])
    const walk = indexer(vault, { maxFileSize: 64 })

    walk.configure({ exclude: ['drafts/'] })
    await walk.scan()

    // Still indexed by its metadata alone: the size limit given at construction was not reset.
    const [huge] = await rows<{ content: string }>(`SELECT content FROM document WHERE path = 'notes/huge.md'`)
    expect(huge.content).toBe('')
  })

  it('takes a new size limit into use, so a file that was metadata-only gets read', async () => {
    await writeNote('notes/huge.md', ['# Huge', '', 'x'.repeat(200)])
    const walk = indexer(vault, { maxFileSize: 64 })
    await walk.scan()
    expect((await rows<{ content: string }>(`SELECT content FROM document WHERE path = 'notes/huge.md'`))[0].content).toBe('')

    walk.configure({ maxFileSize: 1024 * 1024 })
    await walk.reindex()

    expect((await rows<{ content: string }>(`SELECT content FROM document WHERE path = 'notes/huge.md'`))[0].content).toContain('Huge')
  })

  it('ignores a nonsense value rather than indexing nothing', async () => {
    await writeNote('notes/keep.md', ['# Keep'])
    const walk = indexer()

    walk.configure({ maxFileSize: 0, batchSize: -1 })
    await walk.scan()

    expect(await documentPaths()).toEqual(['notes/keep.md'])
  })

  it('drops a blank mask, which would otherwise be a rule that matches nothing', async () => {
    await writeNote('notes/keep.md', ['# Keep'])
    const walk = indexer()

    walk.configure({ exclude: ['  ', ''] })
    await walk.scan()

    expect(await documentPaths()).toEqual(['notes/keep.md'])
  })
})
