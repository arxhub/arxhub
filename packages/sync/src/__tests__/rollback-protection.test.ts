import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { SyncEngine } from '../engine'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import { Repo } from '../repo'

// The remote head is an unauthenticated pointer the server controls, so the engine anchors every
// sync to the head of the last successful one: a head that does not descend from the anchor means
// the remote was rolled back, forked, or wiped — and the sync must fail loudly instead of quietly
// merging against rewound history.
describe('rollback protection', () => {
  let aVfs: VirtualFileSystem
  let bVfs: VirtualFileSystem
  let remoteStore: VirtualFileSystem
  let a: SyncEngine
  let b: SyncEngine

  beforeEach(async () => {
    aVfs = new NodeFileSystem(`${__dirname}/testdata/rollback/a`, new ConsoleLogger())
    bVfs = new NodeFileSystem(`${__dirname}/testdata/rollback/b`, new ConsoleLogger())
    remoteStore = new NodeFileSystem(`${__dirname}/testdata/rollback/remote`, new ConsoleLogger())
    for (const vfs of [aVfs, bVfs, remoteStore]) await vfs.delete('/', { force: true, recursive: true })

    const aRepo = new Repo(aVfs)
    const bRepo = new Repo(bVfs)
    a = new SyncEngine({ local: aRepo, remote: new VfsSyncRemote(remoteStore) })
    b = new SyncEngine({ local: bRepo, remote: new VfsSyncRemote(remoteStore) })
    await aRepo.prepare()
    await bRepo.prepare()
  })

  function remoteHead(): Promise<string> {
    return remoteStore.file('/head').readText()
  }

  test('a legitimate multi-device flow passes the anchor check on every sync', async () => {
    await aVfs.file('one.md').writeText('first')
    await a.add('one.md')
    await a.sync()
    await b.sync()

    await aVfs.file('two.md').writeText('second')
    await a.add('two.md')
    await a.sync()

    // B's anchor is the old head; the new head descends from it — no rollback, sync proceeds.
    await b.sync()
    expect(await bVfs.file('two.md').readText()).toBe('second')
  })

  test('a rolled-back remote head is rejected', async () => {
    await aVfs.file('one.md').writeText('first')
    await a.add('one.md')
    await a.sync()
    const oldHead = await remoteHead()

    await aVfs.file('two.md').writeText('second')
    await a.add('two.md')
    await a.sync()

    // The server unwinds the head to the older snapshot (both objects are real — only the pointer moved).
    await remoteStore.file('/head').writeText(oldHead)

    await expect(a.sync()).rejects.toThrow(/does not descend/)
  })

  test('a wiped remote is rejected once a device has synced before', async () => {
    await aVfs.file('one.md').writeText('first')
    await a.add('one.md')
    await a.sync()

    await remoteStore.delete('/head', { force: true })

    await expect(a.sync()).rejects.toThrow(/wiped or rolled back/)
  })

  test('deleting the local anchor deliberately re-enters trust-on-first-sync', async () => {
    await aVfs.file('one.md').writeText('first')
    await a.add('one.md')
    await a.sync()
    const oldHead = await remoteHead()

    await aVfs.file('two.md').writeText('second')
    await a.add('two.md')
    await a.sync()

    await remoteStore.file('/head').writeText(oldHead)
    await expect(a.sync()).rejects.toThrow(/does not descend/)

    // The documented recovery path: drop the anchor, accept the remote as-is, converge again.
    await aVfs.delete('/repo/last-synced', { force: true })
    await a.sync()
    expect(await remoteHead()).not.toBe(oldHead)
  })

  test('a snapshot whose parent was rewritten fails the integrity check', async () => {
    await aVfs.file('one.md').writeText('first')
    await a.add('one.md')
    await a.sync()

    await aVfs.file('two.md').writeText('second')
    await a.add('two.md')
    await a.sync()

    // Rewrite the head snapshot's parent in place on the remote: the address commits to files AND
    // parent, so the object no longer hashes to its own name and a fetching device must reject it.
    const head = await remoteHead()
    const objectFile = remoteStore.file(`/objects/${head.slice(0, 2)}/${head.slice(2, 4)}/${head}`)
    const snapshot = JSON.parse(await objectFile.readText())
    snapshot.parent = null
    await objectFile.writeText(JSON.stringify(snapshot))

    await expect(b.sync()).rejects.toThrow(/integrity/)
  })
})
