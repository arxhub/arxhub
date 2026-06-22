import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { manifest } from './manifest'
import EditorPanel from './ui/EditorPanel.vue'

export class EditorPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const { store } = ctx.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: 'arxhub.editor',
      title: 'Editor',
      component: EditorPanel,
      handles: ['.arx'],
    })
  }
}
