import {
  type DeleteOptions,
  type FileHead,
  FileNotFound,
  normalizePath,
  type VirtualDir,
  VirtualDirImpl,
  type VirtualEntry,
  type VirtualFile,
  VirtualFileImpl,
  type VirtualFileSystem,
  type VirtualWalker,
  VirtualWalkerImpl,
} from '@arxhub/vfs'
import AsyncLock from 'async-lock'

async function resolveFile(root: FileSystemDirectoryHandle, pathname: string, create: boolean): Promise<FileSystemFileHandle> {
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

async function resolveDir(root: FileSystemDirectoryHandle, pathname: string): Promise<FileSystemDirectoryHandle> {
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

  dir(pathname: string): VirtualDir {
    return new VirtualDirImpl(this, pathname)
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    const result: VirtualEntry[] = []
    try {
      const root = await navigator.storage.getDirectory()
      const dirHandle = await resolveDir(root, norm)
      for await (const [name, handle] of dirHandle.entries()) {
        const entryPath = norm === '' ? name : `${norm}/${name}`
        if (handle.kind === 'directory') result.push(this.dir(entryPath))
        else if (!name.endsWith('.info')) result.push(this.file(entryPath))
      }
    } catch {
      /* skip inaccessible dirs */
    }
    return result
  }

  walk(prefix: string, cursor?: string): VirtualWalker {
    return new VirtualWalkerImpl(this, normalizePath(prefix), cursor)
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
    return (await handle.createWritable()) as unknown as WritableStream<Uint8Array>
  }

  async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory()
      const { dir, name } = await resolveParent(root, pathname, false)
      await dir.removeEntry(name, { recursive: options?.recursive ?? false })
    } catch {
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
