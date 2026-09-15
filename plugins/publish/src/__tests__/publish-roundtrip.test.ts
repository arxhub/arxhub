import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsoleLogger } from '@arxhub/core'
import { type SyncRemote, VfsSyncRemote } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import Elysia, { type AnyElysia } from 'elysia'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { PublicationRecord } from '../publish-history'
import { Publisher } from '../publisher'
import { publicReadRoutes } from '../server/public-read-routes'

// End-to-end: Publisher (client) chunks raw source and uploads UNENCRYPTED objects + manifest into a
// VfsSyncRemote-backed store; the public /p routes reassemble and render from that same store. The
// Publisher and the read routes share one store instance, so this exercises the real object model
// without an HTTP hop.
describe('publish round-trip (chunks + manifest, unencrypted)', () => {
  let vaultVfs: VirtualFileSystem
  let storageVfs: VirtualFileSystem
  let publicVfs: VirtualFileSystem
  let publisher: Publisher
  let app: AnyElysia
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'arxhub-publish-unit-'))
    vaultVfs = new NodeFileSystem(join(directory, 'vault'), new ConsoleLogger())
    storageVfs = new NodeFileSystem(join(directory, 'storage'), new ConsoleLogger())
    publicVfs = new NodeFileSystem(join(directory, 'public'), new ConsoleLogger())

    publisher = new Publisher({
      vault: vaultVfs,
      storage: storageVfs,
      remote: new VfsSyncRemote(publicVfs), // unencrypted store, same as the client uses minus HTTP
      logger: new ConsoleLogger(),
    })
    await publisher.load()

    app = new Elysia().use(publicReadRoutes(publicVfs)).compile()
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  const get = (path: string) => app.handle(new Request(`http://localhost${path}`))

  test('publishes an attachment and a plugin-rendered snapshot while retaining exact source bytes', async () => {
    const raw = JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: [{ type: 'image_block', attrs: { path: 'attachments/picture.png' } }] },
    })
    await vaultVfs.file('note.arx').writeText(raw)
    await vaultVfs.file('attachments/picture.png').write(new Uint8Array([1, 2, 3]))
    const custom = new Publisher({
      vault: vaultVfs,
      storage: storageVfs,
      remote: new VfsSyncRemote(publicVfs),
      logger: new ConsoleLogger(),
      render: () => ({ html: '<!doctype html><p>Plugin snapshot</p>', status: 200 }),
    })
    await custom.load()
    await custom.publish('note.arx')
    expect(await (await get('/public/note.arx')).text()).toContain('Plugin snapshot')
    expect(await (await get('/public/note.arx?source=1')).text()).toBe(raw)
    expect((await get('/public/note.arx?html=1')).headers.get('content-disposition')).toContain('attachment')
    expect((await get('/public/attachments/picture.png')).status).toBe(200)
    await custom.unpublish('note.arx')
    expect((await get('/public/note.arx')).status).toBe(404)
    expect((await get('/public/attachments/picture.png')).status).toBe(404)
  })

  test('a refused buffer save leaves publication roots unchanged and later operations still work', async () => {
    await vaultVfs.file('first.md').writeText('First')
    await vaultVfs.file('second.md').writeText('Second')
    let refused = true
    const guarded = new Publisher({
      vault: vaultVfs,
      storage: storageVfs,
      remote: new VfsSyncRemote(publicVfs),
      logger: new ConsoleLogger(),
      beforeRead: async (path) => !(refused && path === 'second.md'),
    })
    await guarded.load()
    await guarded.publish('first.md')
    await expect(guarded.publish('second.md')).rejects.toThrow('Save or recover')
    expect(guarded.list()).toEqual(['first.md'])
    expect(await storageVfs.file('/published.json').readJSON()).toEqual(['first.md'])
    expect((await get('/public/first.md')).status).toBe(200)
    expect((await get('/public/second.md')).status).toBe(404)
    refused = false
    await Promise.all([guarded.publish('second.md'), guarded.unpublish('first.md')])
    expect(guarded.list()).toEqual(['second.md'])
    expect((await get('/public/first.md')).status).toBe(404)
    expect((await get('/public/second.md')).status).toBe(200)
  })

  test('publishing a markdown file serves its RAW source at /p (client renders)', async () => {
    await vaultVfs.file('notes/hello.md').writeText('# Hello\n\nworld')
    await publisher.publish('notes/hello.md')

    const res = await get('/public/notes/hello.md')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(await res.text()).toBe('# Hello\n\nworld')
  })

  test('publishing a folder makes every contained file readable', async () => {
    await vaultVfs.file('docs/a.md').writeText('# A')
    await vaultVfs.file('docs/sub/b.md').writeText('# B')
    await publisher.publish('docs')

    expect((await get('/public/docs/a.md')).status).toBe(200)
    expect((await get('/public/docs/sub/b.md')).status).toBe(200)
  })

  test('an .arx link renders a page and offers the unchanged source, both revoked together', async () => {
    const arx = JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] }] },
    })
    await vaultVfs.file('page.arx').writeText(arx)
    await publisher.publish('page.arx')

    const res = await get('/public/page.arx')
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(await res.text()).toContain('<h2>Title</h2>')
    const source = await get('/public/page.arx?source=1')
    expect(source.headers.get('content-disposition')).toContain('attachment')
    expect(await source.text()).toBe(arx)

    await vaultVfs.file('page.arx').writeText(arx.replace('Title', 'Updated'))
    expect(await (await get('/public/page.arx')).text()).toContain('<h2>Title</h2>')
    await publisher.publish('page.arx')
    expect(await (await get('/public/page.arx')).text()).toContain('<h2>Updated</h2>')
    await publisher.unpublish('page.arx')
    expect((await get('/public/page.arx')).status).toBe(404)
    expect((await get('/public/page.arx?source=1')).status).toBe(404)
  })

  test('invalid or newer .arx remains downloadable and reports an unreadable page', async () => {
    await vaultVfs.file('future.arx').writeText('{"version":2,"doc":{"type":"doc"}}')
    await publisher.publish('future.arx')
    const page = await get('/public/future.arx')
    expect(page.status).toBe(422)
    expect(await page.text()).toContain('This note could not be displayed')
    expect((await get('/public/future.arx?source=1')).status).toBe(200)
  })

  test('a folder index renders .arx and downloads its actual source path', async () => {
    await vaultVfs
      .file('notes/index.arx')
      .writeJSON({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Folder note' }] }] } })
    await publisher.publish('notes')
    const page = await get('/public/notes')
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('href="/api/publish/public/notes/index.arx?source=1"')
  })

  test('public URLs preserve unicode, spaces, hash, percent and question marks in filenames', async () => {
    const name = 'заметка #1 50% ?.arx'
    await vaultVfs
      .file(name)
      .writeJSON({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Encoded path' }] }] } })
    await publisher.publish(name)
    const page = await get(`/public/${encodeURIComponent(name)}`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Encoded path')
  })

  test('the manifest is fetchable for native clients and lists chunk-addressed files', async () => {
    await vaultVfs.file('note.md').writeText('# Note')
    await publisher.publish('note.md')

    const manifest = await (await get('/public/~manifest')).json()
    expect(manifest.version).toBe(1)
    expect(manifest.roots).toEqual(['note.md'])
    expect(manifest.files['note.md'].chunks.length).toBeGreaterThan(0)
  })

  test('unpublishing removes the file from the public surface', async () => {
    await vaultVfs.file('note.md').writeText('# Note')
    await publisher.publish('note.md')
    expect((await get('/public/note.md')).status).toBe(200)

    await publisher.unpublish('note.md')
    expect((await get('/public/note.md')).status).toBe(404)
  })

  test('republishing an unchanged file uploads no new chunks (dedup)', async () => {
    await vaultVfs.file('note.md').writeText('# Note')
    await publisher.publish('note.md')

    const before = await countObjects(publicVfs)
    await publisher.publish('note.md') // idempotent republish
    const after = await countObjects(publicVfs)

    expect(after).toBe(before)
  })
})

// Every head commit is remembered in storage/publish/history.json (synced, beside published.json), and
// any remembered manifest can become the head again: objects are never deleted, so the old manifest
// still resolves — a rollback is the CAS plus the root set of that entry.
describe('publication history and rollback', () => {
  let vaultVfs: VirtualFileSystem
  let storageVfs: VirtualFileSystem
  let publicVfs: VirtualFileSystem
  let app: AnyElysia
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'arxhub-publish-history-'))
    vaultVfs = new NodeFileSystem(join(directory, 'vault'), new ConsoleLogger())
    storageVfs = new NodeFileSystem(join(directory, 'storage'), new ConsoleLogger())
    publicVfs = new NodeFileSystem(join(directory, 'public'), new ConsoleLogger())
    app = new Elysia().use(publicReadRoutes(publicVfs)).compile()
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  const get = (path: string) => app.handle(new Request(`http://localhost${path}`))
  const arx = (text: string) =>
    JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })

  async function makePublisher(options: { remote?: SyncRemote; historyLimit?: number } = {}): Promise<Publisher> {
    const publisher = new Publisher({
      vault: vaultVfs,
      storage: storageVfs,
      remote: options.remote ?? new VfsSyncRemote(publicVfs),
      logger: new ConsoleLogger(),
      historyLimit: options.historyLimit,
    })
    await publisher.load()
    return publisher
  }

  test('publish, republish and roll back are three entries, and the reader serves the rolled-back bytes', async () => {
    const publisher = await makePublisher()
    await vaultVfs.file('page.arx').writeText(arx('First edition'))
    await publisher.publish('page.arx')
    expect(publisher.history()).toMatchObject([{ kind: 'publish', roots: ['page.arx'], files: 1 }])
    const first = publisher.history()[0]
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(Date.parse(first.at)).not.toBeNaN()

    await vaultVfs.file('page.arx').writeText(arx('Second edition'))
    await publisher.publish('page.arx')
    expect(await (await get('/public/page.arx')).text()).toContain('Second edition')
    expect(publisher.history().map((it) => it.kind)).toEqual(['publish', 'publish'])
    expect(publisher.history()[0].hash).not.toBe(first.hash)

    await publisher.rollback(first.hash)
    expect(await (await get('/public/page.arx')).text()).toContain('First edition')
    expect(publisher.history().map((it) => it.kind)).toEqual(['rollback', 'publish', 'publish'])
    expect(publisher.history()[0]).toMatchObject({ hash: first.hash, roots: ['page.arx'], files: 1 })
    expect(publisher.list()).toEqual(['page.arx'])
    expect(await storageVfs.file('/history.json').readJSON<PublicationRecord[]>()).toHaveLength(3)

    // Another device, or the next session: the record is on disk, not in this instance.
    const later = await makePublisher()
    expect(later.history().map((it) => it.kind)).toEqual(['rollback', 'publish', 'publish'])

    await later.unpublish('page.arx')
    expect(later.history()[0]).toMatchObject({ kind: 'unpublish', roots: [], files: 0 })
    expect((await get('/public/page.arx')).status).toBe(404)
  })

  test('a republish that changes nothing moves no head and adds no entry', async () => {
    const publisher = await makePublisher()
    await vaultVfs.file('note.md').writeText('# Note')
    await publisher.publish('note.md')
    await publisher.publish('note.md')
    expect(publisher.history()).toHaveLength(1)
  })

  test('the cap keeps the newest entries and drops the oldest', async () => {
    const publisher = await makePublisher({ historyLimit: 2 })
    for (const name of ['a.md', 'b.md', 'c.md']) {
      await vaultVfs.file(name).writeText(`# ${name}`)
      await publisher.publish(name)
    }
    expect(publisher.history().map((it) => it.roots)).toEqual([
      ['a.md', 'b.md', 'c.md'],
      ['a.md', 'b.md'],
    ])
    expect(await storageVfs.file('/history.json').readJSON<PublicationRecord[]>()).toHaveLength(2)
  })

  test('a lost head race refuses the rollback and leaves roots and history as they were', async () => {
    const publisher = await makePublisher()
    await vaultVfs.file('x.md').writeText('v1')
    await publisher.publish('x.md')
    await vaultVfs.file('x.md').writeText('v2')
    await publisher.publish('x.md')
    const [, v1] = publisher.history()

    // The one thing a rollback must never do is overwrite a head it did not read.
    const real = new VfsSyncRemote(publicVfs)
    const losing: SyncRemote = {
      getHead: () => real.getHead(),
      setHead: async () => false,
      hasObjects: (hashes) => real.hasObjects(hashes),
      getObjects: (hashes) => real.getObjects(hashes),
      putObjects: (objects) => real.putObjects(objects),
    }
    const contender = await makePublisher({ remote: losing })
    await expect(contender.rollback(v1.hash)).rejects.toThrow(/changed on another device/)
    expect(contender.list()).toEqual(['x.md'])
    expect(contender.history()).toHaveLength(2)
    expect(await storageVfs.file('/published.json').readJSON()).toEqual(['x.md'])
    expect(await storageVfs.file('/history.json').readJSON<PublicationRecord[]>()).toHaveLength(2)
    expect(await (await get('/public/x.md')).text()).toBe('v2')

    // And a later operation on the same publisher still runs — a refused rollback is not a wedged queue.
    await expect(contender.rollback('0'.repeat(64))).rejects.toThrow(/not in the history/)
  })

  test('a missing history file and a malformed entry both load as what they are', async () => {
    expect((await makePublisher()).history()).toEqual([])

    await storageVfs
      .file('/history.json')
      .writeJSON([{ hash: 'a'.repeat(64), at: '2026-09-15T10:00:00.000Z', roots: ['a.md'], files: 1, kind: 'publish' }, { hash: 42 }, 'junk'])
    const publisher = await makePublisher()
    expect(publisher.history()).toEqual([{ hash: 'a'.repeat(64), at: '2026-09-15T10:00:00.000Z', roots: ['a.md'], files: 1, kind: 'publish' }])
  })
})

// Count content-addressed objects on disk (chunks + manifests), to prove dedup.
async function countObjects(vfs: VirtualFileSystem): Promise<number> {
  let count = 0
  for await (const _ of vfs.walk('/objects')) count++
  return count
}
