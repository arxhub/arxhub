import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { VaultVfs } from '@arxhub/vfs'
import { EXPLORER_SIDEBAR_ITEM, ExplorerExtension } from './explorer-extension'
import { manifest } from './manifest'
import ExplorerLayout from './ui/ExplorerLayout.vue'

type ExplorerPluginArgs = PluginArgs & {
  root?: string
}

export class ExplorerPlugin extends Plugin {
  private readonly root: string

  constructor(args: ExplorerPluginArgs) {
    super(args, manifest)
    this.root = args.root ?? '/'
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    const vault = ctx.services.get(VaultVfs)
    ctx.extensions.register(ExplorerExtension, () => ({
      vfs: vault,
      root: this.root,
    }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const shell = ctx.extensions.get(ShellExtension)
    shell.sidebar.register({
      id: EXPLORER_SIDEBAR_ITEM,
      icon: 'lu:folder-open',
      title: 'Explorer',
      // Its mobile rail now also holds Tabs and (if Search registers) Search sections — "Explorer"
      // undersells that, but the desktop rail icon is unrelated and keeps its own name.
      mobileTitle: 'Files',
      layout: ExplorerLayout,
      order: 0,
    })
  }
}
