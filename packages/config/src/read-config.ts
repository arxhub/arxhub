import { hasErrorCode } from '@arxhub/errors'
import type { Logger } from '@arxhub/logger'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Static, TObject } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { parse } from 'smol-toml'
import { configPath } from './config-path'
import type { ConfigOptions } from './types'

// What the file actually says, with no schema applied. Split out of readConfig because a setting can
// live in either of two files (see device-local.ts): defaulting each file on its own would make an
// absent key indistinguishable from one written at its default value, and the merge has to tell those
// apart to know which file owns the answer. Defaults are applied once, to the merged result.
export async function readRawConfig(vfs: VirtualFileSystem, opts: ConfigOptions = {}, logger?: Logger): Promise<Record<string, unknown>> {
  const path = configPath(opts)

  let text: string
  try {
    text = await vfs.file(path).readText()
  } catch (error) {
    // No config file yet → nothing said (the normal first-run path). But a transport/IO failure must
    // NOT be silently treated as "absent": that would let writeConfig() merge defaults over a file it
    // couldn't read and erase the user's real settings. Propagate anything but FileNotFound.
    if (hasErrorCode(error, 'FileNotFound')) return {}
    throw error
  }

  try {
    return parse(text) as Record<string, unknown>
  } catch (error) {
    // Corrupt/malformed TOML (content, not IO) must not crash the caller (this runs during plugin
    // start). Degrade to schema defaults so the app still boots; the next writeConfig rewrites it.
    logger?.warn(`[config] failed to parse ${path}, falling back to defaults:`, error)
    return {}
  }
}

// `vfs` is expected to be a plugin's scoped storage view (e.g. PluginConfig's storage), so the config
// file lives at the scope root — this package no longer owns any per-plugin path layout.
export async function readConfig<S extends TObject>(
  vfs: VirtualFileSystem,
  schema: S,
  opts: ConfigOptions = {},
  logger?: Logger,
): Promise<Static<S>> {
  return Value.Default(schema, await readRawConfig(vfs, opts, logger)) as Static<S>
}
