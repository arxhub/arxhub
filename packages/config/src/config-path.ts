import type { ConfigOptions } from './types'

// Resolves the config file name within an already-scoped vfs (e.g. name 'config' → 'config.toml').
// Internal helper shared by readConfig/writeConfig; not part of the package's public surface.
export function configPath(opts: ConfigOptions): string {
  return `${opts.name ?? 'config'}.toml`
}
