import { findLongestPrefix } from '@arxhub/stdlib/fs/find-longest-prefix'
import { FileNotFound } from './errors/file-not-found'
import type { VirtualFile } from './file'
import { MountNotFound } from './errors/mount-not-found'
import { ProxyFile } from './proxy-file'
import type { VirtualFileSystem } from './system'

export class MountableFileSystem implements VirtualFileSystem {
  private mounts: Map<string, VirtualFileSystem>

  constructor() {
    this.mounts = new Map()
  }

  mount(mountpoint: string, vfs: VirtualFileSystem): void {
    this.mounts.set(mountpoint, vfs)
  }

  unmount(mountpoint: string): void {
    this.mounts.delete(mountpoint)
  }

  isFileExists(pathname: string): Promise<boolean> {
    const mount = this.resolve(pathname)
    if (mount == null) return Promise.resolve(false)
    return mount.vfs.isFileExists(mount.pathname)
  }

  file(pathname: string): Promise<VirtualFile> {
    const mount = this.resolve(pathname)
    if (mount == null) throw new FileNotFound(pathname)
    return mount.vfs.file(mount.pathname)
  }

  fileOrNull(pathname: string): Promise<VirtualFile | null> {
    const mount = this.resolve(pathname)
    if (mount == null) return Promise.resolve(null)
    return mount.vfs.fileOrNull(mount.pathname)
  }

  async *listFiles(): AsyncGenerator<VirtualFile> {
    for (const [mountpoint, vfs] of this.mounts.entries()) {
      for await (const file of vfs.listFiles()) {
        yield new ProxyFile(this, file, { prefix: mountpoint })
      }
    }
  }

  readTextFile(pathname: string): Promise<string> {
    const mount = this.resolve(pathname)
    if (mount == null) throw new FileNotFound(pathname)
    return mount.vfs.readTextFile(mount.pathname)
  }

  writeTextFile(pathname: string, content: string): Promise<void> {
    const mount = this.resolve(pathname)
    if (mount == null) throw new MountNotFound(pathname)
    return mount.vfs.writeTextFile(pathname, content)
  }

  async refresh(): Promise<void> {
    await Promise.all([...this.mounts.values()].map((fs) => fs.refresh()))
  }

  private resolve(pathname: string): { vfs: VirtualFileSystem; pathname: string } | null {
    const prefix = findLongestPrefix(this.mounts.keys(), pathname)
    const vfs = prefix ? this.mounts.get(prefix) : null
    if (prefix == null || vfs == null) return null
    return { vfs, pathname: pathname.slice(prefix.length) }
  }
}
