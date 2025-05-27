import type { Logger } from '@arxhub/core'
import {
  GenericFile,
  type MangoQuery,
  type SearchableFileSystem,
  type VirtualFile,
  type VirtualFileProps,
  type VirtualFileSystem,
} from '@arxhub/vfs'
import { Collection, type Cursor } from '@signaldb/core'
import AsyncLock from 'async-lock'
import type { Constructor } from 'type-fest'

export function SearchableFileSystemMixin<T extends Constructor<VirtualFileSystem>>(Base: T, logger: Logger) {
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

    async query(selector: MangoQuery.Selector<VirtualFileProps>): Promise<VirtualFile[]> {
      if (this.outdated) await this.invalidate()
      const files: VirtualFile[] = []

      let cursor: Cursor<VirtualFileProps> | null = null
      try {
        cursor = this.memory.find(selector)
        for (const file of cursor.fetch()) {
          files.push(
            new GenericFile(this, {
              id: file.id,
              version: file.version,
              pathname: file.pathname,
              fields: file.fields,
              metadata: file.metadata,
              contentType: file.contentType,
              moduleType: file.moduleType,
            }),
          )
        }
      } catch (e) {
        logger.error(e)
        cursor?.cleanup()
      }

      return files
    }

    private invalidate(): Promise<void> {
      return this.lock.acquire('invalidate', async () => {
        if (!this.outdated) return

        this.memory.removeMany({})

        for await (const file of super.listFiles()) {
          const fileProps = file.props()
          this.memory.insert(fileProps)
        }

        this.outdated = false
      })
    }
  }
}
