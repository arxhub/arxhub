import { join } from 'node:path'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import AsyncLock from 'async-lock'
import dayjs from 'dayjs'
import { Chunker } from './chunker'
import type { FileStatus, Snapshot, SnapshotFile, SnapshotFileChunk } from './types'

export class Repo {
  private readonly vfs: VirtualFileSystem
  private readonly lock: AsyncLock
  private readonly changes: VirtualFile
  private readonly chunker: Chunker

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs
    this.lock = new AsyncLock()
    this.changes = this.getChangesFile()
    this.chunker = new Chunker()
  }

  add(path: string): Promise<void> {
    return this.lock.acquire('changes', async () => {
      const paths = await this.changes.readJSON<string[]>([])
      paths.push(path)
      await this.changes.writeJSON(paths)
    })
  }

  // TODO: Maybe convert to async iterator
  async status(snapshot: Snapshot): Promise<FileStatus[]> {
    const result: FileStatus[] = []
    const processed = new Set<string>()

    for (const pathname in snapshot.files) {
      const file = this.vfs.file(pathname)
      const status = await this.fileStatus(file, snapshot)
      if (status != null) {
        result.push(status)
      }
      processed.add(file.pathname)
    }

    const paths = await this.changes.readJSON([])

    for (const path of paths) {
      if (processed.has(path)) continue

      for await (const file of this.vfs.list(path)) {
        const status = await this.fileStatus(file, snapshot)
        if (status != null) {
          result.push(status)
        }
        processed.add(file.pathname)
      }
    }

    return result
  }

  private async fileStatus(file: VirtualFile, snapshot: Snapshot): Promise<FileStatus | null> {
    if (await file.isExists()) {
      const hash = await file.hash('sha256')
      const local = snapshot.files[file.pathname]

      if (local == null) {
        return { pathname: file.pathname, type: 'created' }
      } else if (hash !== local.hash) {
        return { pathname: file.pathname, type: 'modified' }
      } else {
        return null
      }
    } else if (snapshot.files[file.pathname] != null) {
      return { pathname: file.pathname, type: 'deleted' }
    }

    return null
  }

  async commit(): Promise<Snapshot> {
    const head = await this.getHeadSnapshot()
    const changes = await this.status(head)
    if (changes.length === 0) {
      return head
    }

    const files: Record<string, SnapshotFile> = { ...head.files }

    for (const change of changes) {
      const { pathname, type } = change

      if (type === 'deleted') {
        delete files[pathname]
        continue
      }

      // else created || modified

      const file = this.vfs.file(pathname)
      const chunks: SnapshotFileChunk[] = []

      for await (const chunk of this.chunker.split(file)) {
        const hash = sha256(chunk)
        const chunkFile = this.getChunkFile(hash)

        if (!(await chunkFile.isExists())) {
          await chunkFile.write(Buffer.from(chunk))
        }

        chunks.push({ hash })
      }

      const fileHash = await file.hash('sha256')

      files[pathname] = {
        hash: fileHash,
        pathname: pathname,
        chunks,
      }
    }

    const snapshot = {
      hash: sha256(JSON.stringify(files)),
      parent: head.hash,
      timestamp: dayjs().unix(),
      files,
    }

    await this.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
    await this.getHeadFile().writeText(snapshot.hash)

    await this.changes.writeJSON([])
    return snapshot
  }

  async findBaseSnapshot(localHead: string, remoteHead: string): Promise<Snapshot | null> {
    const localAncestors = new Set<string>()
    let current: string | null = localHead

    while (current != null) {
      if (localAncestors.has(current)) break
      localAncestors.add(current)
      const snapshot: Snapshot = await this.getSnapshotFile(current).readJSON()
      current = snapshot.parent
    }

    current = remoteHead
    while (current != null) {
      if (localAncestors.has(current)) return this.getSnapshotFile(current).readJSON()
      const snapshot: Snapshot = await this.getSnapshotFile(current).readJSON()
      current = snapshot.parent
    }

    return null
  }

  async merge(
    baseFiles: Record<string, SnapshotFile>,
    localFiles: Record<string, SnapshotFile>,
    remoteFiles: Record<string, SnapshotFile>,
  ): Promise<void> {
    const pathnames = new Set([...Object.keys(baseFiles), ...Object.keys(localFiles), ...Object.keys(remoteFiles)])
    for (const pathname of pathnames) {
      const baseFile = baseFiles[pathname]
      const localFile = localFiles[pathname]
      const remoteFile = remoteFiles[pathname]

      const base = baseFile != null
      const local = localFile != null
      const remote = remoteFile != null

      // Only local exists
      if (local && !remote) {
        if (!base) {
          await this.writeFile(localFile)
        } else if (localFile.hash === baseFile.hash) {
          await this.vfs.delete(pathname)
        }
        // else: local modified, remote deleted -> silently keep local (no conflict)
        continue
      }

      // Only remote exists
      if (!local && remote) {
        if (!base) {
          await this.writeFile(remoteFile)
        } else if (remoteFile.hash === baseFile.hash) {
          await this.vfs.delete(pathname)
        }
        // else: remote modified, local deleted -> silently keep remote (no conflict)
        continue
      }

      // Both exist
      if (localFile.hash !== remoteFile.hash) {
        await this.writeConflictFile(remoteFile)
      }

      // else: same content -> no-op
    }
  }

  private async writeFile(file: SnapshotFile): Promise<void> {
    const stream = this.chunker.merge(file.chunks.map((it) => this.getChunkFile(it.hash)))
    const writable = await this.vfs.file(file.pathname).writable()
    await stream.pipeTo(writable)
    await this.add(file.pathname)
  }

  private async writeConflictFile(remote: SnapshotFile): Promise<void> {
    const { path, name, ext } = splitPathname(remote.pathname)
    const file = this.vfs.file(join(path, `conflict-${remote.hash.slice(0, 8)}-${name}.${ext}`))

    const writable = await file.writable()
    const readable = this.chunker.merge(remote.chunks.map((it) => this.getChunkFile(it.hash)))
    await readable.pipeTo(writable)
    await this.add(file.pathname)
  }

  async prepare(): Promise<void> {
    const hash = sha256('{}')
    const snapshot = this.getSnapshotFile(hash)
    const isSnapshotExists = await snapshot.isExists()
    if (!isSnapshotExists) {
      await snapshot.writeJSON({
        hash: hash,
        parent: null,
        timestamp: 0,
        files: {},
      } satisfies Snapshot)
    }

    const head = this.getHeadFile()
    const isHeadExists = await head.isExists()
    if (!isHeadExists) {
      await head.writeText(hash)
    }
  }

  async getHeadSnapshot(): Promise<Snapshot> {
    const head = this.getHeadFile()
    const hash = await head.readText()
    return this.getSnapshotFile(hash).readJSON()
  }

  async download(from: Repo, hash: string): Promise<void> {
    const snapshot = await from.getSnapshotFile(hash).readJSON<Snapshot>()

    for (const pathname in snapshot.files) {
      const file = snapshot.files[pathname]

      for (const chunk of file.chunks) {
        const toChunkFile = this.getChunkFile(chunk.hash)
        if (!(await toChunkFile.isExists())) {
          const fromChunkFile = from.getChunkFile(chunk.hash)
          const readable = await fromChunkFile.readable()
          const writable = await toChunkFile.writable()
          await readable.pipeTo(writable)
        }
      }
    }

    await this.getSnapshotFile(hash).writeJSON(snapshot)
  }

  async upload(to: Repo, hash: string): Promise<void> {
    if (await to.getSnapshotFile(hash).isExists()) {
      return
    }

    const snapshot = await this.getSnapshotFile(hash).readJSON<Snapshot>()

    for (const pathname in snapshot.files) {
      const file = snapshot.files[pathname]

      for (const chunk of file.chunks) {
        const toChunkFile = to.getChunkFile(chunk.hash)
        if (!(await toChunkFile.isExists())) {
          const fromChunkFile = this.getChunkFile(chunk.hash)
          const readable = await fromChunkFile.readable()
          const writable = await toChunkFile.writable()
          await readable.pipeTo(writable)
        }
      }
    }

    await to.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
  }

  listSnapshots(): AsyncGenerator<VirtualFile> {
    return this.vfs.list('/repo/snapshots')
  }

  getChangesFile(): VirtualFile {
    return this.vfs.file(`/repo/changes`)
  }

  getHeadFile(): VirtualFile {
    return this.vfs.file(`/repo/head`)
  }

  getSnapshotFile(hash: string): VirtualFile {
    return this.vfs.file(`/repo/snapshots/${hash}`)
  }

  getChunkFile(hash: string): VirtualFile {
    return this.vfs.file(`/repo/chunks/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}`)
  }

  getManifestFile(hash: string): VirtualFile {
    return this.vfs.file(`/repo/manifests/${hash}`)
  }
}
