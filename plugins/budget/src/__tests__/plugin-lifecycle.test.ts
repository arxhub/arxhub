import { ExtensionContainer, type PluginContext } from '@arxhub/core'
import type { Logger } from '@arxhub/logger'
import { PluginVfs, type VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, it } from 'vitest'
import { BudgetExtension } from '../budget-extension'
import { BudgetPlugin } from '../budget-plugin'
import { type BudgetData, emptyBudget } from '../model'
import type { BudgetStore } from '../store'

function silentLogger(): Logger {
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  }
  return logger
}

function gatedLoad(): { store: BudgetStore; reached: Promise<void>; release(): void } {
  let reached: (() => void) | null = null
  let release: (() => void) | null = null
  const reachedPromise = new Promise<void>((resolve) => {
    reached = resolve
  })
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const store = {
    load: async (): Promise<BudgetData> => {
      reached?.()
      reached = null
      await wait
      return emptyBudget()
    },
  } as unknown as BudgetStore
  return { store, reached: reachedPromise, release: () => release?.() }
}

function build(): { ctx: PluginContext; plugin: BudgetPlugin; budget: BudgetExtension } {
  const logger = silentLogger()
  const extensions = new ExtensionContainer({ logger })
  // BudgetStore is replaced with a deterministic gated double below. PluginVfs still has to be
  // resolvable when the extension factory constructs the original store.
  const pluginVfs = new PluginVfs({} as VirtualFileSystem, 'budget')
  const ctx = {
    extensions,
    events: {},
    services: { get: () => pluginVfs },
  } as unknown as PluginContext
  const plugin = new BudgetPlugin({ logger })
  plugin.create(ctx)
  return { ctx, plugin, budget: extensions.get(BudgetExtension) }
}

describe('BudgetPlugin lifecycle', () => {
  it('returns from start before the budget store has loaded', async () => {
    const { ctx, plugin, budget } = build()
    const gate = gatedLoad()
    const internals = budget as unknown as { store: BudgetStore; prepare: () => Promise<void> }
    internals.store = gate.store
    internals.prepare = () => Promise.resolve()

    let startSettled = false
    const started = plugin.start(ctx).then(() => {
      startSettled = true
    })

    try {
      await gate.reached
      await Promise.resolve()

      // ArxHub awaits start() before mounting the shell. The store may be remote, so its load must
      // remain detached and the first paint must be able to proceed while status is still opening.
      expect(startSettled).toBe(true)
      expect(budget.status.value).toBe('opening')

      gate.release()
      await started
      await (plugin as unknown as { bringUp: Promise<void> | null }).bringUp
      expect(budget.status.value).toBe('ready')
    } finally {
      gate.release()
      await plugin.stop(ctx).catch(() => undefined)
    }
  })
})
