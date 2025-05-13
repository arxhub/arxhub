import type { VirtualFile, VirtualFileProps, VirtualFileSystem } from '@arxhub/vfs'
import { Collection } from '@signaldb/core'
import AsyncLock from 'async-lock'
import type { Constructor } from 'type-fest'

export interface SearchableFileSystem extends VirtualFileSystem {
  query(): Promise<VirtualFile[]>

  search(): Promise<VirtualFile[]>
}

// TODO: Maybe use class
export function SearchableFileSystemMixin<T extends Constructor<VirtualFileSystem>>(Base: T) {
  return class extends Base implements SearchableFileSystem {
    private readonly memory: Collection<VirtualFileProps>
    private lock: AsyncLock
    private outdated: boolean

    // biome-ignore lint/suspicious/noExplicitAny: TS2545
    constructor(...args: any[]) {
      super(...args)
      this.memory = new Collection()
      this.lock = new AsyncLock()
      this.outdated = true
    }

    async query(): Promise<VirtualFile[]> {
      if (this.outdated) await this.invalidate()
      return Promise.resolve([])
    }

    async search(): Promise<VirtualFile[]> {
      if (this.outdated) await this.invalidate()
      return Promise.resolve([])
    }

    private invalidate(): Promise<void> {
      return this.lock.acquire('invalidate', async () => {
        if (!this.outdated) return

        // TODO: Invalidate memory index
        this.outdated = false
      })
    }
  }
}
