import { Plugin, type PluginArgs, type PluginContext, type PluginManifest } from '@arxhub/core'
import { PanelStoreExtension } from './panel-store-extension'

const manifest: PluginManifest = {
  name: 'Panels',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Tiling panel layout system',
}

export class PanelsPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(PanelStoreExtension, () => ({ bus: ctx.events }))
  }
}
