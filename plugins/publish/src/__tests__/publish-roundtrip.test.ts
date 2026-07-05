import { ConsoleLogger } from '@arxhub/core'
import { VfsSyncRemote } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import Elysia, { type AnyElysia } from 'elysia'
import { beforeEach, describe, expect, test } from 'vitest'
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

  beforeEach(async () => {
    vaultVfs = new NodeFileSystem(`${__dirname}/testdata/roundtrip/vault`, new ConsoleLogger())
    storageVfs = new NodeFileSystem(`${__dirname}/testdata/roundtrip/storage`, new ConsoleLogger())
    publicVfs = new NodeFileSystem(`${__dirname}/testdata/roundtrip/public`, new ConsoleLogger())
    for (const vfs of [vaultVfs, storageVfs, publicVfs]) await vfs.delete('/', { force: true, recursive: true })

    publisher = new Publisher({
      vault: vaultVfs,
      storage: storageVfs,
      remote: new VfsSyncRemote(publicVfs), // unencrypted store, same as the client uses minus HTTP
      logger: new ConsoleLogger(),
    })
    await publisher.load()

    app = new Elysia().use(publicReadRoutes(publicVfs)).compile()
  })

  const get = (path: string) => app.handle(new Request(`http://localhost${path}`))

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

  test('an .arx file serves its raw source bytes (client renders it)', async () => {
    const arx = JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] }] },
    })
    await vaultVfs.file('page.arx').writeText(arx)
    await publisher.publish('page.arx')

    const res = await get('/public/page.arx')
    // Unknown extension → downloaded as bytes, never sniffed/rendered server-side.
    expect(res.headers.get('content-type')).toContain('application/octet-stream')
    expect(await res.text()).toBe(arx)
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
