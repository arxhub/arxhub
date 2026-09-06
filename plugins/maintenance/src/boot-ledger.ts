import type { ArxHub, BootEvents, BootPhase, PluginInfo } from '@arxhub/core'

// The bus taken from the thing it belongs to rather than from `@arxhub/events` directly: maintenance has
// no reason to depend on the events package for one type, and an undeclared import is exactly how a
// plugin ends up resolving by accident (see plugins/codemirror and @arxhub/stdlib).
type BootBus = ArxHub['boot']

// Where one plugin has got to. `off` is a plugin this boot skipped — it is listed rather than omitted,
// because a roster that quietly drops what was switched off reads as a roster that forgot about it.
export type BootState = 'off' | 'waiting' | 'running' | 'ready' | 'failed'

export interface BootEntry {
  name: string
  version: string
  essential: boolean
  state: BootState
  // The furthest phase this plugin reached. Null while it is still waiting for its first one.
  phase: BootPhase | null
  error?: unknown
}

export interface BootLedger {
  entries: BootEntry[]
  // Plugins this boot ran, and how many of them are through `start`. The two numbers a progress bar is.
  total: number
  ready: number
  finished: boolean
}

export function emptyLedger(): BootLedger {
  return { entries: [], total: 0, ready: 0, finished: false }
}

// Folds the boot's own event stream into the shape a screen renders, and nothing more — kept apart from
// the component so every transition is a unit test rather than a mounted Vue tree.
//
// `apply` mutates in place: the screen holds one reactive object for the whole boot, and replacing it per
// event would re-key every row in the list on every step.
export function applyBootEvent(ledger: BootLedger, event: BootLedgerEvent): void {
  if (event.kind === 'roster') {
    ledger.entries = event.roster.map((it) => ({
      name: it.name,
      version: it.version,
      essential: it.essential,
      state: it.enabled ? 'waiting' : 'off',
      phase: null,
    }))
    ledger.total = event.roster.filter((it) => it.enabled).length
    return
  }

  if (event.kind === 'finished') {
    ledger.finished = true
    return
  }

  const entry = ledger.entries.find((it) => it.name === event.step.plugin)
  // A step for a plugin the roster never mentioned should be impossible, and dropping it is still better
  // than growing a second, half-described list beside the real one.
  if (entry == null) return

  entry.phase = event.step.phase
  if (event.step.status === 'failed') {
    entry.state = 'failed'
    entry.error = event.step.error
    return
  }
  // `ready` means through `start`, not through the phase that just ended — every other phase finishing
  // leaves the plugin still on its way.
  entry.state = event.step.status === 'done' && event.step.phase === 'start' ? 'ready' : 'running'
  ledger.ready = ledger.entries.filter((it) => it.state === 'ready').length
}

export type BootLedgerEvent =
  | { kind: 'roster'; roster: readonly PluginInfo[] }
  | { kind: 'step'; step: BootEvents['step'] }
  | { kind: 'finished' }

// Subscribes a ledger to a boot and returns the unsubscribe. The caller owns the ledger so it can keep
// reading it after the boot has died — which is exactly when it matters.
export function followBoot(boot: BootBus, ledger: BootLedger): () => void {
  const off = [
    boot.on('roster', (roster) => applyBootEvent(ledger, { kind: 'roster', roster })),
    boot.on('step', (step) => applyBootEvent(ledger, { kind: 'step', step })),
    boot.on('finished', () => applyBootEvent(ledger, { kind: 'finished' })),
  ]
  return () => {
    for (const cancel of off) cancel()
  }
}
