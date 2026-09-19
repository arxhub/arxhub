import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsoleLogger, ExtensionContainer, type PluginContext, type PluginHost, type ServiceScope } from '@arxhub/core'
import { LazyContainer } from '@arxhub/di'
import { createEventBus, type EventMap } from '@arxhub/events'
import { VaultWatcher, type VfsChange } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VfsPlugin } from '../vfs-plugin'

// The real plugin against a real DI container and a real NodeFileSystem — light enough without a whole
// ArxHub, because setup()/start()/stop() are all this plugin does; configure() is empty and nothing here
// needs the extension registry either.
let rootDir: string
let plugin: VfsPlugin | null = null
let ctx: PluginContext
let services: ServiceScope

function build(): VfsPlugin {
  const logger = new ConsoleLogger()
  const backend = new NodeFileSystem(rootDir, logger)
  const extensions = new ExtensionContainer({ logger })
  services = new LazyContainer<object>('Service')
  ctx = { extensions, events: createEventBus<EventMap>(), services }

  plugin = new VfsPlugin({ logger, fs: backend })
  const host: PluginHost = { services, configureScope: () => {} }
  plugin.setup(host)
  return plugin
}

beforeEach(async () => {
  rootDir = await fs.mkdtemp(join(tmpdir(), 'arxhub-vfs-plugin-'))
  await fs.mkdir(join(rootDir, 'vault'), { recursive: true })
})

afterEach(async () => {
  if (plugin != null) await plugin.stop(ctx).catch(() => undefined)
  plugin = null
  await fs.rm(rootDir, { recursive: true, force: true })
})

describe('a native watch feeds the SAME VfsWatcher the vault view already uses', () => {
  it('reports a file written from outside the app, vault-relative', async () => {
    build()
    await plugin?.start(ctx)
    // start() detaches the OS watch — wait until it has actually attached before writing, or the
    // event is lost and the assertion times out (same race the stop test already worked around).
    await new Promise((resolve) => setTimeout(resolve, 200))

    const watcher = services.get(VaultWatcher)
    const changes: VfsChange[] = []
    const unsubscribe = watcher.subscribe((change) => changes.push(change))

    await fs.writeFile(join(rootDir, 'vault', 'external.md'), '# hello')

    await vi.waitFor(() => expect(changes.some((c) => c.kind === 'written' && c.pathname === 'external.md')).toBe(true), {
      timeout: 5000,
      interval: 50,
    })
    unsubscribe()
  })

  it('unsubscribes the native watch on stop — a write afterwards reports nothing', async () => {
    build()
    await plugin?.start(ctx)
    // Give the detached bring-up time to actually attach the OS-level watch before stopping.
    await new Promise((resolve) => setTimeout(resolve, 200))

    await plugin?.stop(ctx)
    plugin = null

    const watcher = services.get(VaultWatcher)
    const changes: VfsChange[] = []
    watcher.subscribe((change) => changes.push(change))

    await fs.writeFile(join(rootDir, 'vault', 'after-stop.md'), '# nope')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(changes).toHaveLength(0)
  })
})
