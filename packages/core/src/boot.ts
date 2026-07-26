import { hasErrorCode } from '@arxhub/errors'

// Where a boot died. 'instantiate' is not a plugin phase — it is the container building the instances,
// before any plugin code has run.
export type BootPhase = 'instantiate' | 'setup' | 'create' | 'configure' | 'start'

export interface BootFailure {
  // The failing plugin's manifest name, or null when the failure happened before instances existed.
  plugin: string | null
  phase: BootPhase
  error: unknown
}

// A registered plugin as this boot saw it: `enabled` is false for one the boot policy skipped.
export interface PluginInfo {
  name: string
  version: string
  description?: string
  essential: boolean
  enabled: boolean
}

export interface BootOptions {
  // Manifest names of plugins to skip. Essential plugins ignore it — the app cannot come up without
  // them. Core neither decides nor persists this set; the composition root passes what it read from
  // its own boot policy (which must live somewhere no plugin owns, or a broken plugin could take the
  // recovery switch down with it).
  disabled?: readonly string[]
  // Boot the essential plugins only, whatever `disabled` says. The recovery boot: the shell and
  // settings come up, so the owner can turn off whatever broke.
  maintenance?: boolean
}

const isBootFailure = (value: unknown): value is BootFailure =>
  value != null && typeof value === 'object' && 'plugin' in value && 'phase' in value && 'error' in value

// The per-plugin failures behind a boot error, or null when `error` is not one (a boot can also die
// outside any plugin — then there is nothing to attribute and the raw error is all there is).
export function bootFailures(error: unknown): BootFailure[] | null {
  if (!hasErrorCode(error, 'BootFailedError')) return null
  const failures = error.originalError
  return Array.isArray(failures) ? failures.filter(isBootFailure) : null
}
