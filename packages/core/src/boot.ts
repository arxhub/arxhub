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

// One plugin's passage through one phase. `failed` carries the error; the two others do not.
export interface BootStep {
  plugin: string
  phase: BootPhase
  status: 'running' | 'done' | 'failed'
  error?: unknown
}

// What a boot announces while it happens, for a screen that exists BEFORE any plugin does — so it
// cannot be the application-wide bus (that one is created for plugins and reaches them as ctx.events).
// A stream belonging to one object gets its own map; this is ArxHub's.
//
// Two things the shape has to be honest about. `setup`/`create`/`configure` are a synchronous loop, so
// every step of theirs is announced within one turn and a screen sees them already finished — the boot
// is not slowed down to animate them, because that would cost a frame per plugin per phase on every
// launch to dramatise work that takes microseconds. And `start` runs every plugin at once, so several
// are `running` together; that concurrency is what keeps a boot fast and is not an ordering to display.
export interface BootEvents {
  // The full roster, announced once instances exist and before any phase has run — so a screen can
  // draw everything it is waiting for rather than growing a list one plugin at a time.
  roster: readonly PluginInfo[]
  step: BootStep
  // Every plugin is through, or the boot is abandoning. `failures` is empty on a clean boot.
  finished: { failures: readonly BootFailure[] }
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
