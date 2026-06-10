import type { ArxHub } from '@arxhub/core'
import { Plugin, type PluginArgs } from '@arxhub/core'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { VfsExtension } from '@arxhub/plugin-vfs/ui'
import { ExplorerExtension } from './explorer-extension'
import { manifest } from './manifest'
import ExplorerLayout from './ui/ExplorerLayout.vue'

type ExplorerPluginArgs = PluginArgs & {
  root?: string
}

export class ExplorerPlugin extends Plugin<ArxHub> {
  private readonly root: string

  constructor(args: ExplorerPluginArgs) {
    super(args, manifest)
    this.root = args.root ?? '/'
  }

  override create(arxhub: ArxHub): void {
    super.create(arxhub)
    const { vfs } = arxhub.extensions.get(VfsExtension)
    arxhub.extensions.register(ExplorerExtension, () => ({
      vfs,
      root: this.root,
    }))
  }

  override configure(arxhub: ArxHub): void {
    super.configure(arxhub)

    const shell = arxhub.extensions.get(ShellExtension)
    shell.sidebar.register({
      id: 'arxhub.explorer',
      icon: 'lu:folder-open',
      title: 'Explorer',
      layout: ExplorerLayout,
      order: 0,
    })
  }
}
