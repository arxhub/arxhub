import AsyncLock from 'async-lock'
import {
  type DeleteOptions,
  type FileHead,
  FileNotFound,
  type VfsListCursor,
  type VirtualFile,
  type VirtualFileSystem,
  VirtualFileImpl,
  deserializeCursor,
  serializeCursor,
} from '@arxhub/vfs'

async function resolveFile(
  root: FileSystemDirectoryHandle,
  pathname: string,
  create: boolean,
): Promise<FileSystemFileHandle> {
  const parts = pathname.replace(/^\//, '').split('/').filter(Boolean)
  const filename = parts.pop()!
  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create })
  }
  return dir.getFileHandle(filename, { create })
}

async function resolveParent(
  root: FileSystemDirectoryHandle,
  pathname: string,
  create: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
  const parts = pathname.replace(/^\//, '').split('/').filter(Boolean)
  const name = parts.pop()!
  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create })
  }
  return { dir, name }
}

async function resolveDir(
  root: FileSystemDirectoryHandle,
  pathname: string,
): Promise<FileSystemDirectoryHandle> {
  const normalized = pathname.replace(/^\//, '')
  if (!normalized) return root
  const parts = normalized.split('/').filter(Boolean)
  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part)
  }
  return dir
}

export class OPFSFileSystem implements VirtualFileSystem {
  private readonly _lock = new AsyncLock()

  file<T extends Record<string, unknown>>(pathname: string): VirtualFile<T> {
    return new VirtualFileImpl<T>(this, pathname)
  }

  list(prefix: string, cursor?: string): VfsListCursor {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    let currentQueue: string[]
    let currentPending: string[]

    if (cursor) {
      const state = deserializeCursor(cursor)
      currentQueue = [...state.queue]
      currentPending = [...state.pending]
    } else {
      currentQueue = [prefix]
      currentPending = []
    }

    return {
      cursor(): string {
        return serializeCursor({ queue: currentQueue, pending: currentPending })
      },
      async *[Symbol.asyncIterator](): AsyncGenerator<VirtualFile> {
        const root = await navigator.storage.getDirectory()

        while (true) {
          if (currentPending.length > 0) {
            const pathname = currentPending.shift()!
            yield new VirtualFileImpl(self, pathname)
            continue
          }

          if (currentQueue.length === 0) break

          const dirPath = currentQueue.shift()!

          try {
            const dirHandle = await resolveDir(root, dirPath)
            for await (const [name, handle] of dirHandle.entries()) {
              const entryPath = dirPath === '' ? name : `${dirPath}/${name}`
              if (handle.kind === 'directory') {
                currentQueue.push(entryPath)
              } else if (!name.endsWith('.info')) {
                currentPending.push(entryPath)
              }
            }
          } catch {
            // skip inaccessible dirs
          }
        }
      },
    }
  }

  async read(pathname: string): Promise<Uint8Array> {
    try {
      const root = await navigator.storage.getDirectory()
      const handle = await resolveFile(root, pathname, false)
      const file = await handle.getFile()
      return new Uint8Array(await file.arrayBuffer())
    } catch {
      throw new FileNotFound(pathname)
    }
  }

  async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    try {
      const root = await navigator.storage.getDirectory()
      const handle = await resolveFile(root, pathname, false)
      const file = await handle.getFile()
      return file.stream() as ReadableStream<Uint8Array>
    } catch {
      throw new FileNotFound(pathname)
    }
  }

  async write(pathname: string, content: Uint8Array): Promise<void> {
    const root = await navigator.storage.getDirectory()
    const handle = await resolveFile(root, pathname, true)
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const root = await navigator.storage.getDirectory()
    const handle = await resolveFile(root, pathname, true)
    return handle.createWritable() as unknown as Promise<WritableStream<Uint8Array>>
  }

  async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory()
      const { dir, name } = await resolveParent(root, pathname, false)
      await dir.removeEntry(name, { recursive: options?.recursive ?? false })
    } catch (err) {
      if (options?.force) return
      throw new FileNotFound(pathname)
    }
  }

  async exists(pathname: string): Promise<boolean> {
    try {
      const root = await navigator.storage.getDirectory()
      await resolveFile(root, pathname, false)
      return true
    } catch {
      return false
    }
  }

  async head(pathname: string): Promise<FileHead> {
    try {
      const root = await navigator.storage.getDirectory()
      const handle = await resolveFile(root, pathname, false)
      const file = await handle.getFile()
      return {
        size: file.size,
        modifiedAt: file.lastModified,
        // OPFS does not expose createdAt — using lastModified as approximation
        createdAt: file.lastModified,
      }
    } catch {
      throw new FileNotFound(pathname)
    }
  }

  async lock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
    return this._lock.acquire(pathname, fn)
  }

  async acquireLock(pathname: string): Promise<() => void> {
    let release!: () => void
    await new Promise<void>((outer) => {
      this._lock.acquire(
        pathname,
        () =>
          new Promise<void>((inner) => {
            release = inner
            outer()
          }),
      )
    })
    return release
  }
}
