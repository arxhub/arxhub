import { NamedContainer } from '@arxhub/stdlib/collections'
import type { VirtualFile } from './file'
import type { VirtualFileSystem } from './system'

export class CompositeFileSystem extends NamedContainer<VirtualFileSystem> implements VirtualFileSystem {
  readonly name: string

  constructor(name: string) {
    super('CompositeFileSystem')
    this.name = name
  }

  isFileExists(location: string): Promise<boolean> {
    const [vfs] = this.getByLocation(location)
    return vfs.isFileExists(location)
  }

  file(location: string): Promise<VirtualFile> {
    const [vfs] = this.getByLocation(location)
    return vfs.file(location)
  }

  fileOrNull(location: string): Promise<VirtualFile | null> {
    const [vfs] = this.getByLocation(location)
    return vfs.fileOrNull(location)
  }

  // TODO: Convert to AsyncIterator
  async listFiles(): Promise<VirtualFile[]> {
    const allFiles: VirtualFile[] = []
    for (const fs of this.values()) {
      const files = await fs.listFiles()
      allFiles.push(...files)
    }
    return allFiles
  }

  readTextFile(location: string | VirtualFile): Promise<string> {
    // biome-ignore lint/style/noParameterAssign: Unwrap location from VirtualFile
    location = typeof location === 'string' ? location : location.location
    const [vfs] = this.getByLocation(location)
    return vfs.readTextFile(location)
  }

  async refresh(): Promise<void> {
    await Promise.all(this.values().map((fs) => fs.refresh()))
  }

  getByLocation(location: string): [vfs: VirtualFileSystem, pathname: string] {
    const [prefix, ...pathname] = location.split(':')
    const vfs = this.get(prefix)
    return [vfs, pathname.join(':')]
  }
}
