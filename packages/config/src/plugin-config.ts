import type { Logger } from '@arxhub/logger'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Static, TObject } from '@sinclair/typebox'
import { readConfig } from './read-config'
import type { ConfigOptions } from './types'
import { writeConfig } from './write-config'

// Per-plugin config service — a single plugin's own TOML config, already scoped to its storage view
// (PluginVfs.storage). The DI-resolved analog of VfsPlugin's PluginVfs: a plugin reads its config via
// `ctx.services.get(PluginConfig)` instead of threading a storage VFS + schema into the free
// readConfig/writeConfig functions (which remain the underlying implementation).
export class PluginConfig {
  private readonly storage: VirtualFileSystem
  private readonly logger: Logger

  constructor(storage: VirtualFileSystem, logger: Logger) {
    this.storage = storage
    this.logger = logger
  }

  read<S extends TObject>(schema: S, opts: ConfigOptions = {}): Promise<Static<S>> {
    return readConfig(this.storage, schema, opts, this.logger)
  }

  // Like read(), but answers null when the store itself could not be read (offline, unauthorised,
  // transport failure) instead of throwing. For startup paths: the product works offline, so an
  // unreachable store must leave a plugin idle rather than abort the whole boot.
  //
  // A null answer means "settings unknown", NOT "settings empty" — the caller must degrade and must
  // never write, or write() would merge defaults over a file it never read and erase real settings.
  async tryRead<S extends TObject>(schema: S, opts: ConfigOptions = {}): Promise<Static<S> | null> {
    try {
      return await this.read(schema, opts)
    } catch (error) {
      this.logger.warn('Could not read configuration — continuing without it', error)
      return null
    }
  }

  write<S extends TObject>(schema: S, data: Partial<Static<S>>, opts: ConfigOptions = {}): Promise<void> {
    return writeConfig(this.storage, schema, data, opts, this.logger)
  }
}
