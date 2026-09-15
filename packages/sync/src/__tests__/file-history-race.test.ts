import { ConsoleLogger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { ScopedFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { EMPTY_SNAPSHOT_HASH } from '../empty-snapshot-hash'
import { FileHistory } from '../file-history'
import { Repo } from '../repo'
import { snapshotHash } from '../snapshot-hash'
import type { Snapshot } from '../types'

// Two devices (or two tabs) pointed at the same server never share an in-process lock — `Repo.exclusive()`
// only serializes calls made through ONE Repo instance. These tests build independent Repo/FileHistory
// pairs over separate NodeFileSystem instances that all resolve to the SAME store directory, which is
// exactly that shape: nothing here shares memory, only files. What keeps them honest is the head's
// compare-and-swap (Repo.advanceHead), which on Node is a lock the whole process shares.
const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

let storeDir: string
let historyA: FileHistory
let historyB: FileHistory
let repoA: Repo
let repoB: Repo

const fs = (dir: string) => new NodeFileSystem(dir, new ConsoleLogger())

beforeEach(async () => {
  storeDir = `${__dirname}/testdata/history-race`
  await fs(storeDir).delete('/', { recursive: true, force: true })
  repoA = new Repo(fs(`${storeDir}/tree-a`), fs(`${storeDir}/store`))
  repoB = new Repo(fs(`${storeDir}/tree-b`), fs(`${storeDir}/store`))
  // Both devices must agree on the empty root before racing — otherwise the race is conflated with the
  // ordinary "which of us creates head first" case `prepare()` already handles.
  await repoA.prepare()
  historyA = new FileHistory(repoA)
  historyB = new FileHistory(repoB)
})

// Walks head → root, checking every link's integrity, and returns the set of addresses on the chain.
async function chainOf(repo: Repo): Promise<Set<string>> {
  const chain = new Set<string>()
  let current: string | null = (await repo.getHeadSnapshot()).hash
  while (current != null) {
    const snapshot: Snapshot = await repo.getSnapshotFile(current).readJSON<Snapshot>()
    expect(snapshotHash(snapshot.parent, snapshot.files)).toBe(current)
    chain.add(current)
    current = snapshot.parent
  }
  return chain
}

test('every checkpoint recorded by either device across a shared store is reachable from list(), on both sides', async () => {
  const identity = 'doc-race'
  const path = 'vault/note.arx'
  const rounds = 10

  await Promise.all(
    Array.from({ length: rounds }, (_, i) => {
      const history = i % 2 === 0 ? historyA : historyB
      return history.record({ identity, path, content: encode(`v${i}`) })
    }),
  )

  const versionsA = await historyA.list({ identity })
  const versionsB = await historyB.list({ identity })
  const contentsA = await Promise.all(versionsA.map((v) => historyA.read({ identity }, v).then(decode)))

  const expected = new Set(Array.from({ length: rounds }, (_, i) => `v${i}`))
  expect(new Set(contentsA)).toEqual(expected)
  expect(versionsA).toHaveLength(rounds)
  expect(versionsB).toEqual(versionsA)
})

test('a checkpoint recorded for another path under the same identity does not erase one recorded concurrently', async () => {
  // The exact ArxEditor.buildState shape: two devices each believe they hold identity X, one at path A,
  // the other (a copy, or a rename this device has not seen yet) at path B. `recordCheckpoint` drops every
  // OTHER path holding the same identity when it writes — so if device B's write reaches head without
  // ever having retried on top of device A's, A's entry silently disappears from `list()`, and
  // `buildState`'s "is this a copy" check (`list(id)` empty at path A) then answers wrongly.
  const identity = 'doc-buildstate'
  await Promise.all([
    historyA.record({ identity, path: 'vault/a.arx', content: encode('content-a') }),
    historyB.record({ identity, path: 'vault/b.arx', content: encode('content-b') }),
  ])

  const versions = await historyA.list({ identity })
  expect(versions.some((v) => v.path === 'vault/a.arx')).toBe(true)
  expect(versions.some((v) => v.path === 'vault/b.arx')).toBe(true)
})

describe('Repo.snapshot across one store', () => {
  // Two tabs over one vault share the TREE as well as the store, so that is the shape here — four
  // instances, one directory each for tree and store.
  const repos: Repo[] = []

  beforeEach(() => {
    repos.length = 0
    for (let i = 0; i < 4; i++) repos.push(new Repo(fs(`${storeDir}/tree`), fs(`${storeDir}/store`)))
  })

  test('concurrent snapshots land on ONE chain: every snapshot returned is reachable from the final head, which holds every file', async () => {
    const tree = fs(`${storeDir}/tree`)
    // The journal is a shared read-modify-write of its own and not what is under test — filled in turn.
    for (const [i, repo] of repos.entries()) {
      await tree.file(`vault/note-${i}.txt`).writeText(`note ${i}`)
      await repo.add(`vault/note-${i}.txt`)
    }

    const returned = await Promise.all(repos.map((repo) => repo.snapshot()))

    const chain = await chainOf(repos[0])
    for (const snapshot of returned) expect(chain.has(snapshot.hash)).toBe(true)
    expect(chain.has(EMPTY_SNAPSHOT_HASH)).toBe(true)
    const head = await repos[0].getHeadSnapshot()
    expect(Object.keys(head.files).sort()).toEqual(repos.map((_, i) => `vault/note-${i}.txt`))
    for (const [i, entry] of Object.values(head.files)
      .sort((a, b) => a.pathname.localeCompare(b.pathname))
      .entries()) {
      expect(entry.hash).toBe(sha256(`note ${i}`))
    }
  })

  test('a second round over changed files still converges on one chain that carries the first', async () => {
    const tree = fs(`${storeDir}/tree`)
    for (const [i, repo] of repos.entries()) {
      await tree.file(`vault/note-${i}.txt`).writeText(`note ${i}`)
      await repo.add(`vault/note-${i}.txt`)
    }
    const first = await Promise.all(repos.map((repo) => repo.snapshot()))
    for (const [i, repo] of repos.entries()) {
      await tree.file(`vault/note-${i}.txt`).writeText(`note ${i} again`)
      await repo.add(`vault/note-${i}.txt`)
    }
    const second = await Promise.all(repos.map((repo) => repo.snapshot()))

    const chain = await chainOf(repos[0])
    for (const snapshot of [...first, ...second]) expect(chain.has(snapshot.hash)).toBe(true)
    const head = await repos[0].getHeadSnapshot()
    for (let i = 0; i < repos.length; i++) expect(head.files[`vault/note-${i}.txt`].hash).toBe(sha256(`note ${i} again`))
  })
})

// A store whose head compare-and-swap never succeeds — what sustained contention, or a bug that always
// loses, looks like from the inside. The retry must be bounded and end in a named condition.
class HeadNeverYields extends ScopedFileSystem {
  constructor(inner: VirtualFileSystem) {
    super(inner, '')
  }
  override async compareAndSwap(): Promise<boolean> {
    return false
  }
}

test('a head that never yields ends in RepoHeadMovedError, for a snapshot and for a checkpoint alike', async () => {
  const isHeadMoved = (error: unknown) => hasErrorCode(error, 'RepoHeadMovedError')
  const stuck = new Repo(fs(`${storeDir}/tree-a`), new HeadNeverYields(fs(`${storeDir}/store`)))
  await fs(`${storeDir}/tree-a`).file('vault/x.txt').writeText('x')
  await stuck.add('vault/x.txt')
  await expect(stuck.snapshot()).rejects.toSatisfy(isHeadMoved)
  await expect(new FileHistory(stuck).record({ identity: 'x', path: 'vault/x.txt', content: encode('x') })).rejects.toSatisfy(isHeadMoved)
  // The head itself was never touched: the store's real head is still the empty root.
  expect(await repoA.getHeadFile().readText()).toBe(EMPTY_SNAPSHOT_HASH)
})

// Lets a test put something between "rebase has replayed everything" and "rebase moves the head" — the
// window a second device's checkpoint used to fall into. Fires once, on the first swap only.
class InterposeBeforeFirstSwap extends ScopedFileSystem {
  private fired = false
  constructor(
    inner: VirtualFileSystem,
    private readonly before: () => Promise<void>,
  ) {
    super(inner, '')
  }
  override async compareAndSwap(pathname: string, expected: Uint8Array | null, next: Uint8Array): Promise<boolean> {
    if (!this.fired) {
      this.fired = true
      await this.before()
    }
    return super.compareAndSwap(pathname, expected, next)
  }
}

describe('Repo.rebase when the local head moves while it replays', () => {
  const identity = 'doc-rebase'
  const path = 'vault/note.arx'
  let local: Snapshot
  let remote: Snapshot
  let base: Snapshot

  beforeEach(async () => {
    // Local chain: E → L1 (a checkpoint recorded on A). Remote: R, a sibling of L1 on E, already fetched
    // into the store the way the engine would. Base: E.
    await historyA.record({ identity, path, content: encode('v1') })
    local = await repoA.getHeadSnapshot()
    base = await repoA.getSnapshotFile(EMPTY_SNAPSHOT_HASH).readJSON<Snapshot>()
    const files = { 'vault/other.txt': { fileId: 'f-other', pathname: 'vault/other.txt', hash: sha256('other'), size: 5, chunks: [] } }
    remote = { parent: EMPTY_SNAPSHOT_HASH, files, hash: snapshotHash(EMPTY_SNAPSHOT_HASH, files), timestamp: 1 }
    await repoA.getSnapshotFile(remote.hash).writeJSON(remote)
  })

  test('a checkpoint that landed on the local chain mid-replay is replayed too, never orphaned', async () => {
    const rebasing = new Repo(
      fs(`${storeDir}/tree-a`),
      new InterposeBeforeFirstSwap(fs(`${storeDir}/store`), () => historyB.record({ identity, path, content: encode('v2') })),
    )
    await rebasing.rebase(local, remote, base)

    // head → L2' → L1' → R → E: both checkpoints sit on top of the remote, in order, and the remote's
    // own file came along.
    const head = await repoA.getHeadSnapshot()
    expect(head.files[path].hash).toBe(sha256('v2'))
    expect(head.files['vault/other.txt']).toBeDefined()
    const replayedFirst = await repoA.getSnapshotFile(head.parent as string).readJSON<Snapshot>()
    expect(replayedFirst.files[path].hash).toBe(sha256('v1'))
    expect(replayedFirst.parent).toBe(remote.hash)
    expect((await historyA.list({ identity })).map((version) => version.hash)).toEqual([sha256('v2'), sha256('v1')])
    await chainOf(repoA)
  })

  test('a local chain rewritten under it is refused with RepoHeadMovedError and the head is left alone', async () => {
    // Not a descendant of L1 — what another device's own rebase leaves behind — so replaying L1's delta
    // onto the remote would put back history that device already moved.
    const rewritten: Snapshot = { parent: EMPTY_SNAPSHOT_HASH, files: {}, hash: snapshotHash(EMPTY_SNAPSHOT_HASH, {}), timestamp: 2 }
    await repoA.getSnapshotFile(rewritten.hash).writeJSON(rewritten)
    const rebasing = new Repo(
      fs(`${storeDir}/tree-a`),
      new InterposeBeforeFirstSwap(fs(`${storeDir}/store`), async () => {
        expect(await repoB.advanceHead(local.hash, rewritten.hash)).toBe(true)
      }),
    )
    await expect(rebasing.rebase(local, remote, base)).rejects.toSatisfy((error) => hasErrorCode(error, 'RepoHeadMovedError'))
    expect(await repoA.getHeadFile().readText()).toBe(rewritten.hash)
  })
})
