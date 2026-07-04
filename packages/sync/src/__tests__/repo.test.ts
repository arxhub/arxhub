import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { Repo } from '../repo'
import type { Snapshot } from '../types'

// download() treats `from` as an untrusted remote (zero-trust server). It must verify that the
// decrypted bytes hash to the path they came from before trusting them into the local store —
// otherwise a malicious/buggy server could swap blobs and corrupt the ancestry chain or resurrect
// deleted files on merge.
describe('Repo.download integrity', () => {
  let fromVfs: VirtualFileSystem
  let toVfs: VirtualFileSystem
  let from: Repo
  let to: Repo

  beforeEach(async () => {
    fromVfs = new NodeFileSystem(`${__dirname}/testdata/download/from`, new ConsoleLogger())
    toVfs = new NodeFileSystem(`${__dirname}/testdata/download/to`, new ConsoleLogger())
    await fromVfs.delete('/', { force: true, recursive: true })
    await toVfs.delete('/', { force: true, recursive: true })

    from = new Repo(fromVfs)
    to = new Repo(toVfs)
    await from.prepare()
    await to.prepare()
  })

  // Produce a real, valid snapshot on the remote and return it.
  async function seedRemote(pathname: string, content: string): Promise<Snapshot> {
    await fromVfs.file(pathname).writeText(content)
    await from.add(pathname)
    return from.snapshot()
  }

  test('given untampered remote should download snapshot and chunks', async () => {
    const snapshot = await seedRemote('note.txt', 'hello world')

    await to.download(from, snapshot.hash)

    expect(await to.getSnapshotFile(snapshot.hash).exists()).toBe(true)
    const chunkHash = snapshot.files['note.txt'].chunks[0].hash
    expect(await to.getChunkFile(chunkHash).readText()).toEqual('hello world')
  })

  test('given a snapshot whose content does not match its path should reject', async () => {
    const snapshot = await seedRemote('note.txt', 'hello world')

    // Server swaps the blob: the file at path `snapshot.hash` now decrypts to a snapshot whose own
    // .hash field is something else.
    await from.getSnapshotFile(snapshot.hash).writeJSON<Snapshot>({
      hash: 'deadbeef',
      parent: null,
      timestamp: 0,
      files: {},
    })

    await expect(to.download(from, snapshot.hash)).rejects.toThrow(/Snapshot integrity check failed/)
  })

  test('given a chunk whose content does not hash to its recorded hash should reject', async () => {
    const snapshot = await seedRemote('note.txt', 'hello world')
    const chunkHash = snapshot.files['note.txt'].chunks[0].hash

    // Server tampers the chunk blob so its bytes no longer hash to the content-addressed path.
    await from.getChunkFile(chunkHash).write(new TextEncoder().encode('tampered'))

    await expect(to.download(from, snapshot.hash)).rejects.toThrow(/Chunk integrity check failed/)
    // The bad chunk must not have been written into the local store.
    expect(await to.getChunkFile(chunkHash).exists()).toBe(false)
  })
})
