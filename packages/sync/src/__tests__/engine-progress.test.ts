import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { type FetchProgress, SyncEngine } from '../engine'
import type { SyncRemote } from '../remote/sync-remote'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import { Repo } from '../repo'

// A remote that can be told to fail on a given getObjects call — the closest a test gets to the app
// being killed in the middle of a first download.
class InterruptingRemote implements SyncRemote {
  requested: string[] = []
  failOnGet: number | null = null
  private gets = 0
  private readonly inner: SyncRemote

  constructor(inner: SyncRemote) {
    this.inner = inner
  }

  getHead(): Promise<string | null> {
    return this.inner.getHead()
  }
  setHead(expected: string | null, next: string): Promise<boolean> {
    return this.inner.setHead(expected, next)
  }
  hasObjects(hashes: string[]): Promise<Set<string>> {
    return this.inner.hasObjects(hashes)
  }
  getObjects(hashes: string[]): Promise<Map<string, Uint8Array>> {
    this.gets += 1
    if (this.failOnGet != null && this.gets >= this.failOnGet) return Promise.reject(new Error('connection lost'))
    this.requested.push(...hashes)
    return this.inner.getObjects(hashes)
  }
  putObjects(objects: Map<string, Uint8Array>): Promise<void> {
    return this.inner.putObjects(objects)
  }
  reset(): void {
    this.gets = 0
    this.failOnGet = null
    this.requested = []
  }
}

// A device whose disk gives out after a number of vault writes — a first download killed mid-merge.
class FailingFileSystem extends NodeFileSystem {
  vaultWritesLeft = Number.POSITIVE_INFINITY

  override async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    if (pathname.replace(/^\//, '').startsWith('vault/')) {
      if (this.vaultWritesLeft <= 0) throw new Error('killed')
      this.vaultWritesLeft -= 1
    }
    return super.writable(pathname)
  }
}

const FILES = 40
// Distinct content per file so every file is at least one chunk of its own; more files than one
// GET batch (32), so a download spans several batches.
const contentOf = (i: number) => `document ${i} `.repeat(20 + i)

describe('SyncEngine first download', () => {
  let first: VirtualFileSystem
  let joiner: FailingFileSystem
  let remote: InterruptingRemote
  let firstEngine: SyncEngine
  let joinerRepo: Repo

  beforeEach(async () => {
    first = new NodeFileSystem(`${__dirname}/testdata/engine-progress/first`, new ConsoleLogger())
    joiner = new FailingFileSystem(`${__dirname}/testdata/engine-progress/joiner`, new ConsoleLogger())
    const remoteStore = new NodeFileSystem(`${__dirname}/testdata/engine-progress/remote`, new ConsoleLogger())
    for (const vfs of [first, joiner, remoteStore]) await vfs.delete('/', { force: true, recursive: true })

    remote = new InterruptingRemote(new VfsSyncRemote(remoteStore))
    const firstRepo = new Repo(first)
    await firstRepo.prepare()
    firstEngine = new SyncEngine({ local: firstRepo, remote })
    for (let i = 0; i < FILES; i++) await first.file(`vault/doc-${i}.md`).writeText(contentOf(i))
    await first.file('storage/sync/config.toml').writeText('serverUrl = "https://hub.example.com"\n')
    await firstEngine.add('vault')
    await firstEngine.add('storage')
    await firstEngine.sync()

    joinerRepo = new Repo(joiner)
    await joinerRepo.prepare()
    remote.reset()
  })

  function joinerEngine(): { engine: SyncEngine; progress: FetchProgress[] } {
    const engine = new SyncEngine({ local: joinerRepo, remote })
    const progress: FetchProgress[] = []
    engine.events.on('progress', (p) => progress.push(p))
    return { engine, progress }
  }

  async function expectVaultComplete(): Promise<void> {
    for (let i = 0; i < FILES; i++) expect(await joiner.file(`vault/doc-${i}.md`).readText()).toBe(contentOf(i))
    const entries = await joiner.list('vault')
    expect(entries.filter((entry) => entry.pathname.includes('conflict-'))).toEqual([])
  }

  test('reports vault files and deduplicated bytes, rising to complete', async () => {
    const { engine, progress } = joinerEngine()
    await engine.sync()

    const last = progress.at(-1)
    expect(progress[0]).toMatchObject({ filesDone: 0, filesTotal: FILES, bytesDone: 0, cloudBytes: 0 })
    const expectedVaultBytes = Array.from({ length: FILES }, (_, i) => new TextEncoder().encode(contentOf(i)).byteLength).reduce(
      (a, b) => a + b,
    )
    // Plugin storage travels with the vault's bytes but is not a document.
    expect(last?.bytesTotal).toBeGreaterThan(expectedVaultBytes)
    expect(last).toMatchObject({ filesDone: FILES, filesTotal: FILES, bytesDone: last?.bytesTotal })
    // One report before the first batch and one after each: several batches, never going backwards.
    expect(progress.length).toBeGreaterThan(2)
    for (let i = 1; i < progress.length; i++) expect(progress[i].bytesDone).toBeGreaterThanOrEqual(progress[i - 1].bytesDone)
    await expectVaultComplete()
  })

  test('counts files the policy leaves in the cloud as cloud bytes, not as owed', async () => {
    joinerRepo.setMaterializePolicy((file) => file.pathname !== 'vault/doc-39.md')
    const { engine, progress } = joinerEngine()
    await engine.sync()

    const big = new TextEncoder().encode(contentOf(39)).byteLength
    expect(progress.at(-1)).toMatchObject({ filesDone: FILES - 1, filesTotal: FILES - 1, cloudBytes: big })
    expect(await joinerRepo.isPending('vault/doc-39.md')).toBe(true)
  })

  test('a fetch cut short resumes with only the chunks it had not stored', async () => {
    const cut = joinerEngine()
    // The first getObjects fetches the head snapshot; the second is the first chunk batch.
    remote.failOnGet = 3
    await expect(cut.engine.sync()).rejects.toThrow('connection lost')
    const fetchedBefore = new Set(remote.requested)
    const doneBefore = cut.progress.at(-1)?.bytesDone ?? 0
    expect(doneBefore).toBeGreaterThan(0)

    remote.reset()
    const resumed = joinerEngine()
    await resumed.engine.sync()

    // Nothing that landed before the cut is asked for again, and the read-out starts where it stopped.
    expect(remote.requested.filter((hash) => fetchedBefore.has(hash))).toEqual([])
    expect(resumed.progress[0].bytesDone).toBe(doneBefore)
    expect(resumed.progress.at(-1)).toMatchObject({ filesDone: FILES, filesTotal: FILES })
    await expectVaultComplete()
  })

  test('a merge cut short resumes without conflict copies or a second download', async () => {
    joiner.vaultWritesLeft = 7
    const cut = joinerEngine()
    await expect(cut.engine.sync()).rejects.toThrow('killed')

    joiner.vaultWritesLeft = Number.POSITIVE_INFINITY
    remote.reset()
    const resumed = joinerEngine()
    const result = await resumed.engine.sync()

    expect(result.conflicts).toEqual([])
    // Every chunk arrived before the merge began, so the second round fetches no content at all.
    expect(resumed.progress[0]).toMatchObject({ filesDone: FILES, bytesDone: resumed.progress[0].bytesTotal })
    await expectVaultComplete()
  })
})
