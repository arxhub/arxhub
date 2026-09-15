import { ConsoleLogger } from '@arxhub/core'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SyncEngine } from '../engine'
import { mergeText } from '../merge/text-merge'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import type { ContentMerger } from '../repo'
import { Repo } from '../repo'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe('Repo.setContentMerger', () => {
  let aVfs: VirtualFileSystem
  let bVfs: VirtualFileSystem
  let remoteStore: VirtualFileSystem
  let store: VfsSyncRemote
  let aRepo: Repo
  let bRepo: Repo
  let a: SyncEngine
  let b: SyncEngine

  beforeEach(async () => {
    aVfs = new NodeFileSystem(`${__dirname}/testdata/content-merge/a`, new ConsoleLogger())
    bVfs = new NodeFileSystem(`${__dirname}/testdata/content-merge/b`, new ConsoleLogger())
    remoteStore = new NodeFileSystem(`${__dirname}/testdata/content-merge/remote`, new ConsoleLogger())
    await aVfs.delete('/', { force: true, recursive: true })
    await bVfs.delete('/', { force: true, recursive: true })
    await remoteStore.delete('/', { force: true, recursive: true })

    store = new VfsSyncRemote(remoteStore)
    aRepo = new Repo(aVfs)
    bRepo = new Repo(bVfs)
    a = new SyncEngine({ local: aRepo, remote: store })
    b = new SyncEngine({ local: bRepo, remote: store })

    await aRepo.prepare()
    await bRepo.prepare()
  })

  // Establishes a shared baseline, then diverges both sides — the shape every test in this file starts
  // from, mirroring the "given both sides modify same file should create conflict" fixture in
  // engine.test.ts but parameterised on the content each side ends up with.
  async function diverge(localContent: string, remoteContent: string): Promise<void> {
    await aVfs.file('doc.txt').writeText('original')
    await a.add('doc.txt')
    await a.sync()
    await b.sync()

    await aVfs.file('doc.txt').writeText(localContent)
    await a.add('doc.txt')

    await bVfs.file('doc.txt').writeText(remoteContent)
    await b.add('doc.txt')
    await b.sync()
  }

  test('is called with the base, local and remote content, all present', async () => {
    const merger = vi.fn<ContentMerger>(async () => null)
    aRepo.setContentMerger(merger)

    await diverge('local modified', 'remote modified')
    await a.sync()

    expect(merger).toHaveBeenCalledTimes(1)
    const [pathname, base, local, remote] = merger.mock.calls[0]
    expect(pathname).toBe('doc.txt')
    expect(base && decoder.decode(base)).toBe('original')
    expect(decoder.decode(local)).toBe('local modified')
    expect(decoder.decode(remote)).toBe('remote modified')
  })

  test('returning null falls back to a conflict copy, exactly like no merger at all', async () => {
    aRepo.setContentMerger(async () => null)

    await diverge('local modified', 'remote modified')
    const result = await a.sync()

    expect(await aVfs.file('doc.txt').readText()).toBe('local modified')
    expect(result.conflicts).toEqual(['conflict-af216312-doc.txt'])
    expect(result.unresolved).toEqual([])
  })

  test('a result is written to the path and its conflict count is reported as unresolved, not as a copy', async () => {
    const merger: ContentMerger = async (_pathname, _base, local, remote) => ({
      merged: encoder.encode(`${decoder.decode(local)} | ${decoder.decode(remote)}`),
      conflicts: 1,
    })
    aRepo.setContentMerger(merger)

    await diverge('local modified', 'remote modified')
    const result = await a.sync()

    expect(await aVfs.file('doc.txt').readText()).toBe('local modified | remote modified')
    expect(result.conflicts).toEqual([])
    expect(result.unresolved).toEqual([{ pathname: 'doc.txt', count: 1 }])
    // No conflict copy was ever written.
    expect(await aVfs.exists('conflict-af216312-doc.txt')).toBe(false)
  })

  test('a fully-resolved merge (zero conflicts) is not reported as unresolved at all', async () => {
    const merger: ContentMerger = async (_pathname, _base, local) => ({ merged: local, conflicts: 0 })
    aRepo.setContentMerger(merger)

    await diverge('local modified', 'remote modified')
    const result = await a.sync()

    expect(result.conflicts).toEqual([])
    expect(result.unresolved).toEqual([])
  })

  test('a checked-out file this device holds after the merge trusts its stat, so a later status sees no phantom change', async () => {
    aRepo.setContentMerger(async (_pathname, _base, local, remote) => ({
      merged: encoder.encode(`${decoder.decode(local)} | ${decoder.decode(remote)}`),
      conflicts: 0,
    }))

    await diverge('local modified', 'remote modified')
    await a.sync()

    // A no-op second sync must not treat the merged file as changed again.
    const before = await aVfs.file('doc.txt').readText()
    const second = await a.sync()
    expect(second.conflicts).toEqual([])
    expect(second.unresolved).toEqual([])
    expect(await aVfs.file('doc.txt').readText()).toBe(before)
  })

  test('edit-vs-delete is never offered to the merger, and is reported as a decision instead', async () => {
    const merger = vi.fn<ContentMerger>(async () => null)
    aRepo.setContentMerger(merger)

    await aVfs.file('doc.txt').writeText('original')
    await a.add('doc.txt')
    await a.sync()
    await b.sync()

    await bVfs.file('doc.txt').writeText('remote modified')
    await b.add('doc.txt')
    await b.sync()

    // A deletes its own copy without having seen B's edit yet — the remote edit must survive (FR-152),
    // and never reach the merger: there is no local document left to hold a conflict marker in.
    await aVfs.delete('doc.txt')

    const result = await a.sync()

    expect(await aVfs.file('doc.txt').readText()).toBe('remote modified')
    expect(merger).not.toHaveBeenCalled()
    expect(result.decisions).toEqual([{ pathname: 'doc.txt', kind: 'edit-over-delete' }])
  })

  // The shape plugins/repository registers for text: the line merge over a base, a decline without one.
  const textMerger: ContentMerger = async (_pathname, base, local, remote) => {
    if (base == null) return null
    const { merged, conflicts } = mergeText(decoder.decode(base), decoder.decode(local), decoder.decode(remote))
    return { merged: encoder.encode(merged), conflicts }
  }

  test('a markdown note edited on both devices merges line by line and lands on both, with nothing left to report', async () => {
    aRepo.setContentMerger(textMerger)
    bRepo.setContentMerger(textMerger)

    await aVfs.file('note.md').writeText('# Title\n\nfirst\nsecond\nthird\n')
    await a.add('note.md')
    await a.sync()
    await b.sync()

    await aVfs.file('note.md').writeText('# Title\n\nfirst (a)\nsecond\nthird\n')
    await a.add('note.md')
    const remoteText = '# Title\n\nfirst\nsecond\nthird (b)\n'
    await bVfs.file('note.md').writeText(remoteText)
    await b.add('note.md')
    await b.sync()

    const result = await a.sync()
    const merged = '# Title\n\nfirst (a)\nsecond\nthird (b)\n'
    expect(result.conflicts).toEqual([])
    expect(result.unresolved).toEqual([])
    expect(await aVfs.file('note.md').readText()).toBe(merged)
    // The copy a declined merge would have written is named after the remote content's own hash.
    expect(await aVfs.exists(`conflict-${sha256(encoder.encode(remoteText)).slice(0, 8)}-note.md`)).toBe(false)

    // A's round pushed the merged tree, so B takes it as a plain fast-forward — no second merge, no copy.
    const second = await b.sync()
    expect(second.conflicts).toEqual([])
    expect(second.unresolved).toEqual([])
    expect(await bVfs.file('note.md').readText()).toBe(merged)

    // Both checkouts trust what they just wrote: nothing is reported as changed on either side.
    expect(await aRepo.status(await aRepo.getHeadSnapshot())).toEqual([])
    expect(await bRepo.status(await bRepo.getHeadSnapshot())).toEqual([])
  })

  test('a markdown note both devices changed on the same line keeps one file with a conflict region, reported as unresolved', async () => {
    aRepo.setContentMerger(textMerger)

    await aVfs.file('note.md').writeText('one\ntwo\nthree\n')
    await a.add('note.md')
    await a.sync()
    await b.sync()

    await aVfs.file('note.md').writeText('one\ntwo (a)\nthree\n')
    await a.add('note.md')
    await bVfs.file('note.md').writeText('one\ntwo (b)\nthree\n')
    await b.add('note.md')
    await b.sync()

    const result = await a.sync()
    expect(result.conflicts).toEqual([])
    expect(result.unresolved).toEqual([{ pathname: 'note.md', count: 1 }])
    expect(await aVfs.file('note.md').readText()).toBe('one\n<<<<<<< local\ntwo (a)\n=======\ntwo (b)\n>>>>>>> remote\nthree\n')
  })

  test('local edit over a remote delete is also reported as a decision', async () => {
    await aVfs.file('doc.txt').writeText('original')
    await a.add('doc.txt')
    await a.sync()
    await b.sync()

    await bVfs.delete('doc.txt')
    await b.sync()

    await aVfs.file('doc.txt').writeText('local modified')
    await a.add('doc.txt')

    const result = await a.sync()

    expect(await aVfs.file('doc.txt').readText()).toBe('local modified')
    expect(result.decisions).toEqual([{ pathname: 'doc.txt', kind: 'edit-over-delete' }])
  })
})
