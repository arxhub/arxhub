import { PluginConfig } from '@arxhub/config'
import { ExtensionContainer, type PluginContext } from '@arxhub/core'
import { LazyContainer } from '@arxhub/di'
import { createEventBus, type EventMap } from '@arxhub/events'
import { ConsoleLogger } from '@arxhub/logger'
import { RepositoryExtension } from '@arxhub/plugin-repository'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { ShellExtension } from '@arxhub/plugin-shell'
import { VaultVfs, VaultWatcher, VfsWatcher, type VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { NotesExtension } from '../notes-extension'
import { NotesPlugin } from '../notes-plugin'
import { NOTES_TYPE_ID } from '../notes-type'

const Viewer = defineComponent({ name: 'Viewer', render: () => null })

function setup(): {
  ctx: PluginContext
  notes: NotesExtension
  plugin: NotesPlugin
  repository: RepositoryExtension
} {
  const logger = new ConsoleLogger()
  const extensions = new ExtensionContainer({ logger })
  extensions.register(ShellExtension)
  extensions.register(SettingsExtension)
  extensions.register(RepositoryExtension, () => ({
    repo: { setContentMerger: vi.fn() } as unknown as ConstructorParameters<typeof RepositoryExtension>[0]['repo'],
    rootVfs: {} as VirtualFileSystem,
    keyring: {} as unknown as ConstructorParameters<typeof RepositoryExtension>[0]['keyring'],
  }))

  const services = new LazyContainer<object>('Service')
  services.bind(VaultWatcher, () => new VfsWatcher())
  services.bind(VaultVfs, () => ({ exists: async () => true }) as unknown as VirtualFileSystem)
  services.register(PluginConfig, () => [{} as VirtualFileSystem, logger])
  vi.spyOn(services.get(PluginConfig), 'tryRead').mockResolvedValue(null)
  const ctx: PluginContext = { extensions, events: createEventBus<EventMap>(), services }
  const plugin = new NotesPlugin({ logger })
  plugin.create(ctx)
  plugin.configure(ctx)
  const notes = extensions.get(NotesExtension)
  const repository = extensions.get(RepositoryExtension)
  return { ctx, notes, plugin, repository }
}

function registerViewer(notes: NotesExtension, readMode?: 'range'): void {
  notes.registerViewer({
    id: readMode == null ? 'ordinary' : 'range',
    panelId: 'panel',
    title: 'Test viewer',
    extensions: ['.pdf'],
    component: Viewer,
    ...(readMode == null ? {} : { readMode }),
  })
}

describe('pending note preparation', () => {
  test('range viewers wait for repository readiness without materializing', async () => {
    const { ctx, notes, plugin, repository } = setup()
    const ready = vi.spyOn(repository, 'ready').mockResolvedValue()
    const materialize = vi.spyOn(repository, 'materializeIfPending').mockResolvedValue()
    registerViewer(notes, 'range')

    await plugin.start(ctx)
    await notes.prepare('pending.pdf')

    expect(ready).toHaveBeenCalledOnce()
    expect(materialize).not.toHaveBeenCalled()
    await plugin.stop(ctx)
  })

  test('ordinary viewers remain fully materialized after repository readiness', async () => {
    const { ctx, notes, plugin, repository } = setup()
    const ready = vi.spyOn(repository, 'ready').mockResolvedValue()
    const materialize = vi.spyOn(repository, 'materializeIfPending').mockResolvedValue()
    registerViewer(notes)

    await plugin.start(ctx)
    await notes.prepare('pending.pdf')

    expect(ready).toHaveBeenCalledOnce()
    expect(materialize).toHaveBeenCalledWith('pending.pdf')
    await plugin.stop(ctx)
  })

  test('an unknown viewer keeps the ordinary materialization path', async () => {
    const { ctx, notes, plugin, repository } = setup()
    const ready = vi.spyOn(repository, 'ready').mockResolvedValue()
    const materialize = vi.spyOn(repository, 'materializeIfPending').mockResolvedValue()

    await plugin.start(ctx)
    await notes.prepare('pending.unknown')

    expect(ready).toHaveBeenCalledOnce()
    expect(materialize).toHaveBeenCalledWith('pending.unknown')
    await plugin.stop(ctx)
  })

  test('a repository readiness error still aborts opening before materialization', async () => {
    const { ctx, notes, plugin, repository } = setup()
    const failure = new Error('repository unavailable')
    vi.spyOn(repository, 'ready').mockRejectedValue(failure)
    const materialize = vi.spyOn(repository, 'materializeIfPending').mockResolvedValue()
    registerViewer(notes, 'range')

    await plugin.start(ctx)
    await expect(notes.prepare('pending.pdf')).rejects.toBe(failure)
    expect(materialize).not.toHaveBeenCalled()
    await plugin.stop(ctx)
  })

  test('a materialization error still aborts an ordinary opening', async () => {
    const { ctx, notes, plugin, repository } = setup()
    vi.spyOn(repository, 'ready').mockResolvedValue()
    const failure = new Error('sync is off')
    vi.spyOn(repository, 'materializeIfPending').mockRejectedValue(failure)
    registerViewer(notes)

    await plugin.start(ctx)
    await expect(notes.prepare('pending.pdf')).rejects.toBe(failure)
    await plugin.stop(ctx)
  })

  test('restoring a present range-viewed object skips materialization', async () => {
    const { ctx, notes, plugin, repository } = setup()
    const ready = vi.spyOn(repository, 'ready').mockResolvedValue()
    const materialize = vi.spyOn(repository, 'materializeIfPending').mockResolvedValue()
    registerViewer(notes, 'range')

    await plugin.start(ctx)
    const type = ctx.extensions.get(ShellExtension).types.get(NOTES_TYPE_ID)
    if (type?.objects == null) throw new Error('Notes type does not expose objects')
    const revived = await type.objects.revive({ path: 'pending.pdf' })

    expect(revived).toMatchObject({ key: 'pending.pdf' })
    expect(ready).toHaveBeenCalledOnce()
    expect(materialize).not.toHaveBeenCalled()
    await plugin.stop(ctx)
  })
})
