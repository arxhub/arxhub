import { PluginConfig } from '@arxhub/config'
import { ExtensionContainer, type PluginContext } from '@arxhub/core'
import { LazyContainer } from '@arxhub/di'
import { createEventBus, type EventMap } from '@arxhub/events'
import type { Logger } from '@arxhub/logger'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { VaultVfs } from '@arxhub/vfs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotesConfig } from '../notes-config'
import { NotesExtension } from '../notes-extension'
import { NotesPlugin } from '../notes-plugin'

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
        return config
      }
    },
  )
}

function gatedTryRead(savedHide: boolean) {
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

  let onSave: ((cfg: NotesConfig) => void) | null = null

  const config = {
    tryRead: async () => {
      reachedResolve?.()
      reachedResolve = null
      await gate
      settledResolve?.()
      settledResolve = null
      return { 'names.hideKnownExtensions': savedHide }
    },
    watch: vi.fn((_schema: unknown, listener: (cfg: NotesConfig) => void) => {
      onSave = listener
      return () => {
        onSave = null
      }
    }),
    write: vi.fn(async () => undefined),
  } as unknown as PluginConfig

  return {
    config,
    reached,
    settled,
    finish: () => openGate?.(),
    simulateSave: (cfg: NotesConfig) => onSave?.(cfg),
  }
}

const vfsStub = {} as VirtualFileSystem

let ctx: PluginContext
let plugin: NotesPlugin
let notes: NotesExtension

function startLoadConfig(): Promise<void> {
  const boot = plugin as unknown as {
    bootConfigPending: boolean
    loadConfig: (context: PluginContext, notes: NotesExtension) => Promise<void>
  }
  boot.bootConfigPending = true
  return boot.loadConfig(ctx, notes)
}

function build(gate: ReturnType<typeof gatedTryRead>): void {
  const logger = silentLogger()
  const extensions = new ExtensionContainer({ logger })
  extensions.register(ShellExtension)
  extensions.register(SettingsExtension)
  const services = new LazyContainer<object>('Service')
  registerPluginConfig(services, gate.config)
  services.bind(VaultVfs, () => vfsStub)

  ctx = { extensions, events: createEventBus<EventMap>(), services }
  plugin = new NotesPlugin({ logger })
  plugin.create(ctx)
  plugin.configure(ctx)
  notes = extensions.get(NotesExtension)
}

beforeEach(() => {
  notes = undefined as unknown as NotesExtension
})

afterEach(async () => {
  await plugin?.stop(ctx).catch(() => undefined)
})

describe('loadConfig vs early settings save (TH-24-01)', () => {
  it('does not replay stale tryRead over config.watch that landed while read was pending', async () => {
    const gate = gatedTryRead(true)
    build(gate)

    const bringUp = startLoadConfig()
    await gate.reached

    gate.simulateSave({ 'names.hideKnownExtensions': false })
    expect(notes.hideKnownExtensions.value).toBe(false)

    gate.finish()
    await gate.settled
    await bringUp

    expect(notes.hideKnownExtensions.value).toBe(false)
  })

  it('applies saved config when nothing was saved before tryRead lands', async () => {
    const gate = gatedTryRead(false)
    build(gate)

    const bringUp = startLoadConfig()
    await gate.reached
    expect(notes.hideKnownExtensions.value).toBe(true)

    gate.finish()
    await gate.settled
    await bringUp

    expect(notes.hideKnownExtensions.value).toBe(false)
  })
})
