import { ConsoleLogger } from '@arxhub/core'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Checkout } from '../checkout'
import { Repo } from '../repo'

const enc = (s: string) => new TextEncoder().encode(s)

describe('Checkout', () => {
  let vfs: VirtualFileSystem
  let checkout: Checkout

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/checkout`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
    checkout = new Checkout(vfs, vfs.file('/index'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('hashes a file it has never seen, and answers null for one that is not there', async () => {
    await vfs.write('a.txt', enc('alpha'))
    expect(await checkout.hashOf('a.txt')).toBe(sha256(enc('alpha')))
    expect(await checkout.hashOf('missing.txt')).toBeNull()
  })

  test('an unchanged file is answered from the index without being read', async () => {
    await vfs.write('a.txt', enc('alpha'))
    // Record well after the write, so the entry is outside the racy window and stat alone is trusted.
    const { modifiedAt } = await vfs.head('a.txt')
    vi.spyOn(Date, 'now').mockReturnValue(modifiedAt + 10_000)
    await checkout.record('a.txt', sha256(enc('alpha')))
    await checkout.flush()

    const readable = vi.spyOn(vfs, 'readable')
    const again = new Checkout(vfs, vfs.file('/index'))
    expect(await again.hashOf('a.txt')).toBe(sha256(enc('alpha')))
    expect(readable).not.toHaveBeenCalled()
  })

  test('a file written by something else — same path, no sidecar, new stat — is read again and reports its real hash', async () => {
    await vfs.write('a.txt', enc('alpha'))
    const { modifiedAt } = await vfs.head('a.txt')
    vi.spyOn(Date, 'now').mockReturnValue(modifiedAt + 10_000)
    await checkout.record('a.txt', sha256(enc('alpha')))
    vi.restoreAllMocks()

    // A foreign write: straight to the backend, a different size so the stat cannot agree.
    await vfs.write('a.txt', enc('alpha, edited elsewhere'))
    expect(await checkout.hashOf('a.txt')).toBe(sha256(enc('alpha, edited elsewhere')))
  })

  test('an entry recorded within the racy window is not trusted on stat alone', async () => {
    await vfs.write('a.txt', enc('alpha'))
    // Recorded "now", right after the write — mtime and checkedAt within 2 s of each other.
    await checkout.record('a.txt', 'a hash that is wrong on purpose')

    expect(await checkout.hashOf('a.txt')).toBe(sha256(enc('alpha')))
  })

  test('the index survives in the store and is device state, not content', async () => {
    await vfs.write('a.txt', enc('alpha'))
    await checkout.hashOf('a.txt')
    await checkout.flush()

    const stored = await vfs.file('/index').readJSON<Record<string, { hash: string; size: number }>>()
    expect(stored['a.txt']).toMatchObject({ hash: sha256(enc('alpha')), size: 5 })
  })
})

describe('Repo.status through the checkout', () => {
  let vfs: VirtualFileSystem
  let repo: Repo

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/checkout-repo`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
    repo = new Repo(vfs)
    await repo.prepare()
  })

  test('an edit made outside the app is a modification', async () => {
    await vfs.file('/data/note.md').writeText('first')
    await repo.add('/data')
    const head = await repo.snapshot()

    // Not through VirtualFile.write — the raw backend, the way another program on the machine writes.
    await vfs.write('/data/note.md', enc('first, then edited by someone else'))

    const changes = await repo.status(head)
    expect(changes).toEqual([{ pathname: 'data/note.md', type: 'modified' }])
  })

  test('a file gone from the tree is a deletion, whatever the index remembered', async () => {
    await vfs.file('/data/note.md').writeText('first')
    await repo.add('/data')
    const head = await repo.snapshot()

    await vfs.delete('/data/note.md')

    expect(await repo.status(head)).toEqual([{ pathname: 'data/note.md', type: 'deleted' }])
  })
})
