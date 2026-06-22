import { hasErrorCode } from '@arxhub/errors'
import type { Logger } from '@arxhub/logger'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Static, TObject } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { parse } from 'smol-toml'
import { configPath } from './config-path'
import type { ConfigOptions } from './types'

// `vfs` is expected to be a plugin's scoped storage view (e.g. PluginConfig's storage), so the config
// file lives at the scope root — this package no longer owns any per-plugin path layout.
export async function readConfig<S extends TObject>(
  vfs: VirtualFileSystem,
  schema: S,
  opts: ConfigOptions = {},
  logger?: Logger,
): Promise<Static<S>> {
  const path = configPath(opts)

  let text: string
  try {
    text = await vfs.file(path).readText()
  } catch (error) {
    // No config file yet → schema defaults (the normal first-run path). But a transport/IO failure
    // must NOT be silently treated as "absent": that would let writeConfig() merge defaults over a
    // file it couldn't read and erase the user's real settings. Propagate anything but FileNotFound.
    if (hasErrorCode(error, 'FileNotFound')) return Value.Default(schema, {}) as Static<S>
    throw error
  }

  let raw: unknown
  try {
    raw = parse(text)
  } catch (error) {
    // Corrupt/malformed TOML (content, not IO) must not crash the caller (this runs during plugin
    // start). Degrade to schema defaults so the app still boots; the next writeConfig rewrites it.
    logger?.warn(`[config] failed to parse ${path}, falling back to defaults:`, error)
    raw = {}
  }
  return Value.Default(schema, raw) as Static<S>
}
