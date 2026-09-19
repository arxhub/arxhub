import { PluginConfig } from '@arxhub/config'
import { ExtensionContainer, type PluginContext } from '@arxhub/core'
import { LazyContainer } from '@arxhub/di'
import { createEventBus, type EventMap } from '@arxhub/events'
import type { Logger } from '@arxhub/logger'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Theme } from '../theme-extension'
import { ThemeExtension } from '../theme-extension'
import { ThemePlugin } from '../theme-plugin'

const bundled: Theme[] = [
  { id: 'default', title: 'Default', base: 'light' },
  { id: 'slate', title: 'Slate', base: 'dark' },
  { id: 'berry', title: 'Berry', base: 'light' },
]

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

function registerPluginConfig(services: LazyContainer<object>, config: PluginConfig): void {
  services.register(
    PluginConfig,
    class extends PluginConfig {
      constructor() {
        super({} as VirtualFileSystem, silentLogger())
        Object.assign(this, config)
      }
    },
  )
}

// Parks tryRead at a gate so start() can return while loadTheme is still in flight — the TH-22-01 window.
function gatedTryRead(savedTheme: string) {
  let openGate: (() => void) | null = null
  const gate = new Promise<void>((resolve) => {
    openGate = resolve
  })
  let reachedResolve: (() => void) | null = null
  const reached = new Promise<void>((resolve) => {
    reachedResolve = resolve
  })
  let settledResolve: (() => void) | null = null
  const settled = new Promise<void>((resolve) => {
    settledResolve = resolve
  })

  const config = {
    tryRead: async () => {
      reachedResolve?.()
      reachedResolve = null
      await gate
      settledResolve?.()
      settledResolve = null
      return { theme: savedTheme }
    },
    write: vi.fn(async () => undefined),
  } as unknown as PluginConfig

  return {
    config,
    reached,
    settled,
    finish: () => openGate?.(),
  }
}

let ctx: PluginContext
let plugin: ThemePlugin
let themes: ThemeExtension

function build(gate: ReturnType<typeof gatedTryRead>): void {
  const logger = silentLogger()
  const extensions = new ExtensionContainer({ logger })
  const services = new LazyContainer<object>('Service')
  registerPluginConfig(services, gate.config)

  ctx = { extensions, events: createEventBus<EventMap>(), services }
  plugin = new ThemePlugin({ logger, themes: bundled })
  plugin.create(ctx)
  themes = extensions.get(ThemeExtension)
  themes.register(...bundled)
}

beforeEach(() => {
  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
    },
  })
})

afterEach(async () => {
  await plugin?.stop(ctx).catch(() => undefined)
  vi.unstubAllGlobals()
})

describe('loadTheme vs immediate pick (TH-22-01)', () => {
  it('does not replay saved theme over an apply that landed while tryRead was pending', async () => {
    const gate = gatedTryRead('slate')
    build(gate)

    await plugin.start(ctx)
    await gate.reached

    themes.apply('berry')
    expect(themes.activeId.value).toBe('berry')

    gate.finish()
    await gate.settled
    await (plugin as unknown as { bringUp: Promise<void> | null }).bringUp

    expect(themes.activeId.value).toBe('berry')
  })

  it('applies saved theme when nothing was picked before tryRead lands', async () => {
    const gate = gatedTryRead('slate')
    build(gate)

    await plugin.start(ctx)
    await gate.reached
    expect(themes.activeId.value).toBeNull()

    gate.finish()
    await gate.settled
    await (plugin as unknown as { bringUp: Promise<void> | null }).bringUp

    expect(themes.activeId.value).toBe('slate')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-arxhub-theme', 'slate')
  })
})
