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

  write<S extends TObject>(schema: S, data: Partial<Static<S>>, opts: ConfigOptions = {}): Promise<void> {
    return writeConfig(this.storage, schema, data, opts, this.logger)
  }
}
