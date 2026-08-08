import { Plugin, type PluginArgs, type PluginContext, type PluginManifest } from '@arxhub/core'
import { toaster } from '@arxhub/uikit/hooks'
import { VaultWatcher } from '@arxhub/vfs'
import { PanelStoreExtension } from './panel-store-extension'
import { applyVaultChangeToPanels } from './vault-panel-sync'

const manifest: PluginManifest = {
  name: 'Panels',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Tiling panel layout system',
  // Settings renders its pages into a panel store.
  essential: true,
}

export class PanelsPlugin extends Plugin {
  private unwatchVault: (() => void) | null = null

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(PanelStoreExtension, () => ({ bus: ctx.events }))
  }

  // Neither frame gets its own copy of this: the store is shared between DesktopPanels and
  // MobilePanels, so reacting here — once, at the plugin level — covers both. VaultWatcher is bound by
  // VfsPlugin (also essential) during `setup()`, before any plugin's `start()` runs, so it is always
  // there to resolve by the time this does.
  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)
    const { store } = ctx.extensions.get(PanelStoreExtension)
    this.unwatchVault = ctx.services.get(VaultWatcher).subscribe((change) => {
      const closed = applyVaultChangeToPanels(store, change)
      // A rename is silent — it is still the same document, just at a new path. A delete is not: the
      // panel just disappeared, and nothing else would tell the owner why.
      if (closed) toaster.create({ title: 'File deleted', description: change.pathname, type: 'info' })
    })
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.unwatchVault?.()
    this.unwatchVault = null
    await super.stop(ctx)
  }
}
