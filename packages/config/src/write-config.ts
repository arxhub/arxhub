import type { Logger } from '@arxhub/logger'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Static, TObject } from '@sinclair/typebox'
import { stringify } from 'smol-toml'
import { configPath } from './config-path'
import { readConfig } from './read-config'
import type { ConfigOptions } from './types'

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
