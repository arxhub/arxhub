import { Plugin, type PluginArgs, type PluginContext, type PluginManifest } from '@arxhub/core'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { PanelStoreExtension } from './panel-store-extension'
import { notesSheetOpen } from './ui/mobile/notes-tab'

const manifest: PluginManifest = {
  name: 'Panels',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Tiling panel layout system',
  // Settings renders its pages into a panel store.
  essential: true,
}

export class PanelsPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(PanelStoreExtension, () => ({ bus: ctx.events }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    const { store } = ctx.extensions.get(PanelStoreExtension)

    // On the mobile frame the tab strip is gone, so the open documents need a key of their own — with
    // the count on it, because one document at a time hides how many are waiting. The desktop frame
    // ignores tabs entirely; registering unconditionally keeps one wiring rather than two.
    ctx.extensions.get(ShellExtension).tabs.register({
      id: 'arxhub.panels.notes',
      icon: 'lu:file-text',
      title: 'Notes',
      order: 0,
      gesture: 'right-edge',
      badge: () => Object.values(store.groups.value).reduce((total, group) => total + group.instances.length, 0),
      active: () => notesSheetOpen.value,
      onSelect: () => {
        notesSheetOpen.value = !notesSheetOpen.value
      },
    })
  }
}
