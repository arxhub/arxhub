import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { VaultVfs } from '@arxhub/vfs'
import { ExplorerExtension } from './explorer-extension'
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
      id: 'arxhub.explorer',
      icon: 'lu:folder-open',
      title: 'Explorer',
      layout: ExplorerLayout,
      order: 0,
    })
  }
}
