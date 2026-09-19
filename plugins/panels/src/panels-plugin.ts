import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { toaster } from '@arxhub/uikit/hooks'
import { VaultWatcher } from '@arxhub/vfs'
import manifest from './manifest'
import { PanelStoreExtension } from './panel-store-extension'
import { applyVaultChangeToPanels } from './vault-panel-sync'

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
  override start(ctx: PluginContext): Promise<void> {
    const { store } = ctx.extensions.get(PanelStoreExtension)
    this.unwatchVault = ctx.services.get(VaultWatcher).subscribe((change) => {
      const closed = applyVaultChangeToPanels(store, change)
      // A rename is silent — it is still the same document, just at a new path. A delete is not: the
      // panel just disappeared, and nothing else would tell the owner why.
      if (closed) toaster.create({ title: 'File deleted', description: change.pathname, type: 'info' })
    })
    return super.start(ctx)
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.unwatchVault?.()
    this.unwatchVault = null
    await super.stop(ctx)
  }
}
