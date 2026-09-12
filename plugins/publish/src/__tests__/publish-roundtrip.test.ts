import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsoleLogger } from '@arxhub/core'
import { VfsSyncRemote } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import Elysia, { type AnyElysia } from 'elysia'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
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

// Count content-addressed objects on disk (chunks + manifests), to prove dedup.
async function countObjects(vfs: VirtualFileSystem): Promise<number> {
  let count = 0
  for await (const _ of vfs.walk('/objects')) count++
  return count
}
