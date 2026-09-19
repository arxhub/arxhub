import { Extension, type ExtensionArgs } from '@arxhub/core'
import { hasErrorCode, illegalState } from '@arxhub/errors'
import {
  ObservedFileSystem,
  openRangeReader as openLocalRangeReader,
  type RangeReader,
  type VfsWatcher,
  type VirtualFileSystem,
} from '@arxhub/vfs'

export interface PendingRangeSource {
  openRangeReader(pathname: string): Promise<RangeReader | null>
}

export class PendingRangeBroker {
  private source: PendingRangeSource | null = null

  register(source: PendingRangeSource): () => void {
    if (this.source != null) throw illegalState('A pending file range source is already registered')
    this.source = source
    return () => {
      if (this.source === source) this.source = null
    }
  }

  async openRangeReader(local: VirtualFileSystem, pathname: string): Promise<RangeReader> {
    if (await local.exists(pathname)) return openLocalRangeReader(local, pathname)
    const pending = await this.source?.openRangeReader(pathname)
    if (pending != null) return pending
    // Preserve the backend's ordinary FileNotFound error (including its path and error code).
    return openLocalRangeReader(local, pathname)
  }

  async hasPending(pathname: string): Promise<boolean> {
    return (await this.source?.openRangeReader(pathname)) != null
  }
}

// The vault remains a normal observed VFS for writes and whole-file reads. Only metadata/existence
// and range reads fall through to the runtime pending source when the local backend has no file.
export class PendingAwareVaultFileSystem extends ObservedFileSystem {
  private readonly broker: PendingRangeBroker

  constructor(inner: VirtualFileSystem, watcher: VfsWatcher, broker: PendingRangeBroker) {
    super(inner, watcher)
    this.broker = broker
  }

  override async exists(pathname: string): Promise<boolean> {
    if (await super.exists(pathname)) return true
    return this.broker.hasPending(pathname)
  }

  override async head(pathname: string) {
    try {
      return await super.head(pathname)
    } catch (error) {
      if (!hasErrorCode(error, 'FileNotFound')) throw error
      return (await this.broker.openRangeReader(this.inner, pathname)).head()
    }
  }

  override async readRange(pathname: string, offset: number, length?: number): Promise<Uint8Array> {
    try {
      return await super.readRange(pathname, offset, length)
    } catch (error) {
      if (!hasErrorCode(error, 'FileNotFound')) throw error
      return (await this.broker.openRangeReader(this.inner, pathname)).readRange(offset, length)
    }
  }
}

export interface VfsExtensionArgs extends ExtensionArgs {
  localVault: VirtualFileSystem
  broker: PendingRangeBroker
}

export class VfsExtension extends Extension {
  private readonly localVault: VirtualFileSystem
  private readonly broker: PendingRangeBroker

  constructor(args: VfsExtensionArgs) {
    super(args)
    this.localVault = args.localVault
    this.broker = args.broker
  }

  registerPendingRangeSource(source: PendingRangeSource): () => void {
    return this.broker.register(source)
  }

  openRangeReader(pathname: string): Promise<RangeReader> {
    return this.broker.openRangeReader(this.localVault, pathname)
  }
}
