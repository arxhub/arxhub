import { Plugin, type PluginArgs } from '@arxhub/core'
import type { ArxHub } from '@arxhub/core'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { manifest } from './manifest'
import EditorPanel from './ui/EditorPanel.vue'

export class EditorPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(arxhub: ArxHub): void {
    super.configure(arxhub)

    const { store } = arxhub.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: 'arxhub.editor',
      title: 'Editor',
      component: EditorPanel,
      handles: ['.arx'],
    })
  }
}
