import { hasErrorCode } from '@arxhub/errors'
import { createEventBus, type Unsubscribe } from '@arxhub/events'
import type { Logger } from '@arxhub/logger'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Static, TObject } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { configPath } from './config-path'
import { deviceLocalKeys, mergeConfig, pickSchema, splitConfig } from './device-local'
import { readConfig, readRawConfig } from './read-config'
import type { ConfigOptions } from './types'
import { writeConfig } from './write-config'

// One event per config file this service can write (opts.name ?? 'config'), so a watcher on one
// section's file does not re-read on a write to another the same plugin happens to keep separately.
// `value` is the freshly re-read, schema-defaulted config — read once per write() rather than once per
// watcher, and awaited by write() itself so a caller that awaits write() also sees watch() listeners
// having already run.
interface PluginConfigEvents {
  write: { name: string; value: unknown }
}

// Per-plugin config service — a single plugin's own TOML config, already scoped to its own views of
// the plugin buckets. The DI-resolved analog of VfsPlugin's PluginVfs: a plugin reads its config via
// `ctx.services.get(PluginConfig)` instead of threading a storage VFS + schema into the free
// readConfig/writeConfig functions (which remain the underlying implementation).
//
// It spans TWO files, not one. A key the schema annotates `deviceLocal: true` lives in the plugin's
// device-local bucket (PluginVfs.state, never synced); everything else lives in its synced one
// (PluginVfs.storage). The plugin still sees one object either way — which file a key came from is
// the schema's business, not the caller's. See device-local.ts for the ownership/merge rule.
export class PluginConfig {
  private readonly storage: VirtualFileSystem
  private readonly logger: Logger
  // The device-local view. Optional so a construction site without one (a test double, an instance
  // predating the split) still works: with no state view every key stays in the synced file, which is
  // exactly the behaviour this class had before.
  private readonly state?: VirtualFileSystem
  // Local to this instance, which is itself scoped one-per-plugin (ConfigPlugin.setup) — a plugin only
  // ever hears its OWN writes, never another plugin's.
  private readonly bus = createEventBus<PluginConfigEvents>()

  constructor(storage: VirtualFileSystem, logger: Logger, state?: VirtualFileSystem) {
    this.storage = storage
    this.logger = logger
    this.state = state
  }

  // The one way a running plugin learns its own setting changed — fired after every successful write()
  // through this service, synced or device-local, with the freshly re-read merged value. Implemented on
  // the write path rather than by polling files, per "Nothing hand-rolls a listener registry" (AGENTS.md):
  // this reuses createEventBus instead of a bespoke callback list.
  // `schema` is unused in the body — it exists so a caller's schema argument drives S, the same shape
  // read()/write() use it for.
  watch<S extends TObject>(_schema: S, listener: (value: Static<S>) => void, opts: ConfigOptions = {}): Unsubscribe {
    const name = configPath(opts)
    return this.bus.on('write', (event) => {
      if (event.name === name) listener(event.value as Static<S>)
    })
  }

  async read<S extends TObject>(schema: S, opts: ConfigOptions = {}): Promise<Static<S>> {
    const deviceKeys = deviceLocalKeys(schema)
    const state = this.state
    if (state == null || deviceKeys.size === 0) return readConfig(this.storage, schema, opts, this.logger)

    const [synced, device] = await Promise.all([readRawConfig(this.storage, opts, this.logger), readRawConfig(state, opts, this.logger)])
    return Value.Default(schema, mergeConfig(deviceKeys, synced, device)) as Static<S>
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

  async write<S extends TObject>(schema: S, data: Partial<Static<S>>, opts: ConfigOptions = {}): Promise<void> {
    const deviceKeys = deviceLocalKeys(schema)
    const state = this.state
    if (state == null || deviceKeys.size === 0) {
      await writeConfig(this.storage, schema, data, opts, this.logger)
      await this.notifyWritten(schema, opts)
      return
    }

    const parts = splitConfig(deviceKeys, data as Record<string, unknown>)
    // Two files cannot be written atomically, and a settings section that spans both must not
    // half-apply — the shared Save stops at the first failure and reports the section, so "half of it
    // landed" would be a lie. The device file goes first *and* is captured first: the synced view may
    // be an HTTP backend, so it is the write that actually fails, and undoing a local write is the
    // only direction that can be relied on to work in turn.
    const restore = await captureFile(state, configPath(opts))
    await writeConfig(
      state,
      pickSchema(schema, (key) => deviceKeys.has(key)),
      parts.device,
      opts,
      this.logger,
    )
    try {
      await writeConfig(
        this.storage,
        pickSchema(schema, (key) => !deviceKeys.has(key)),
        parts.synced,
        opts,
        this.logger,
      )
    } catch (error) {
      try {
        await restore()
      } catch (failure) {
        this.logger.error('[config] could not roll back the device-local config after a failed write:', failure)
      }
      // The synced failure is what the user has to see and retry; a rollback failure only adds noise.
      throw error
    }
    await this.notifyWritten(schema, opts)
  }

  // Re-reads and emits only if something is actually watching — a write with no watcher must not cost
  // an extra read on every save.
  private async notifyWritten<S extends TObject>(schema: S, opts: ConfigOptions): Promise<void> {
    const name = configPath(opts)
    if (this.bus.listenerCount('write') === 0) return
    const value = await this.read(schema, opts)
    this.bus.emit('write', { name, value })
  }
}

// Snapshots a config file so a later failure can put it back exactly as it was — including "it did
// not exist", which restores as a delete rather than as an empty file nobody wrote.
async function captureFile(vfs: VirtualFileSystem, path: string): Promise<() => Promise<void>> {
  let previous: string | null = null
  try {
    previous = await vfs.file(path).readText()
  } catch (error) {
    if (!hasErrorCode(error, 'FileNotFound')) throw error
  }
  return async () => {
    if (previous == null) await vfs.file(path).delete({ force: true })
    else await vfs.file(path).writeText(previous)
  }
}
