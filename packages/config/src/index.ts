import type { Logger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Static, TObject } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { parse, stringify } from 'smol-toml'

export interface ConfigOptions {
  // File name within the (already-scoped) vfs, without extension. Defaults to 'config' → 'config.toml'.
  name?: string
}

function configPath(opts: ConfigOptions): string {
  return `${opts.name ?? 'config'}.toml`
}

// `vfs` is expected to be a plugin's scoped storage view (e.g. Vfs.storage), so the config
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

export async function writeConfig<S extends TObject>(
  vfs: VirtualFileSystem,
  schema: S,
  data: Partial<Static<S>>,
  opts: ConfigOptions = {},
  logger?: Logger,
): Promise<void> {
  const path = configPath(opts)
  // Forward the logger so a corrupt existing file is logged rather than silently swallowed; and
  // because readConfig now rethrows transport errors, an unreadable file aborts the write instead
  // of clobbering it with defaults+data.
  const existing = await readConfig(vfs, schema, opts, logger)
  const merged = { ...existing, ...data }
  await vfs.file(path).writeText(stringify(merged as Record<string, unknown>))
}
