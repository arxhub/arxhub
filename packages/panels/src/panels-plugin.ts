import { Plugin, type PluginArgs, type PluginManifest } from '@arxhub/core'
import type { ArxHub } from '@arxhub/core'
import { _setPanelEventBus } from './panel-store'

const manifest: PluginManifest = {
  name: 'Panels',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Tiling panel layout system',
}

export class PanelsPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(arxhub: ArxHub): void {
    super.create(arxhub)
    _setPanelEventBus(arxhub.events)
  }
}
