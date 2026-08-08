import { ExtensionContainer, type PluginContext } from '@arxhub/core'
import { LazyContainer } from '@arxhub/di'
import { createEventBus, type EventMap } from '@arxhub/events'
import type { Logger } from '@arxhub/logger'
import { toaster } from '@arxhub/uikit/hooks'
import { VaultWatcher, type VfsChange, type VfsChangeListener, type VfsChangeSource } from '@arxhub/vfs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { PanelStoreExtension } from '../panel-store-extension'
import { PanelsPlugin } from '../panels-plugin'
import type { PanelStore } from '../types'

// Counts its subscribers, which is what proves the plugin subscribes exactly once on start() and lets
// go on stop() — the same shape search's own plugin-lifecycle test uses for the same DI key.
class CountingWatcher implements VfsChangeSource {
  readonly listeners = new Set<VfsChangeListener>()

  subscribe(listener: VfsChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(change: VfsChange): void {
    for (const listener of [...this.listeners]) listener(change)
  }
}

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

const EDITOR = 'test.editor'

let plugin: PanelsPlugin
let ctx: PluginContext
let store: PanelStore
let watcher: CountingWatcher

beforeEach(() => {
  const logger = silentLogger()
  const extensions = new ExtensionContainer({ logger })
  const services = new LazyContainer<object>('Service')
  watcher = new CountingWatcher()
  // The DI key VfsPlugin publishes the shared watcher under (see packages/vfs/src/vfs-scope.ts) —
  // bound here the same way VfsPlugin binds it at the root `services` during its own setup().
  services.bind(VaultWatcher, () => watcher)
  ctx = { extensions, events: createEventBus<EventMap>(), services }

  plugin = new PanelsPlugin({ logger })
  plugin.create(ctx)
  store = extensions.get(PanelStoreExtension).store
  store.registerPanel({ id: EDITOR, title: 'Editor', component: defineComponent({}) })
})

afterEach(async () => {
  await plugin.stop(ctx).catch(() => undefined)
})

describe('PanelsPlugin reacting to the vault it did not write to', () => {
  test('subscribes to the vault watcher on start and lets go on stop', async () => {
    expect(watcher.listeners.size).toBe(0)

    await plugin.start(ctx)
    expect(watcher.listeners.size).toBe(1)

    await plugin.stop(ctx)
    expect(watcher.listeners.size).toBe(0)
  })

  test('closes the open panel and toasts once the vault reports the file gone', async () => {
    store.openPanel(EDITOR, { path: 'notes/todo.md' }, 'todo.md')
    const groupId = store.activeGroupId.value as string
    await plugin.start(ctx)

    const createSpy = vi.spyOn(toaster, 'create')

    watcher.notify({ kind: 'deleted', pathname: 'notes/todo.md' })

    expect(store.groups.value[groupId]).toBeUndefined()
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy.mock.calls[0][0]).toMatchObject({ title: 'File deleted', description: 'notes/todo.md' })

    createSpy.mockRestore()
  })

  test('retargets the panel in place and stays silent when the vault reports a rename', async () => {
    const instanceId = store.openPanel(EDITOR, { path: 'notes/todo.md' }, 'todo.md')
    const groupId = store.activeGroupId.value as string
    await plugin.start(ctx)

    const createSpy = vi.spyOn(toaster, 'create')

    watcher.notify({ kind: 'renamed', pathname: 'notes/done.md', from: 'notes/todo.md' })

    const instance = store.groups.value[groupId]?.instances.find((i) => i.instanceId === instanceId)
    expect(instance?.props?.path).toBe('notes/done.md')
    expect(instance?.title).toBe('done.md')
    expect(createSpy).not.toHaveBeenCalled()

    createSpy.mockRestore()
  })
})
