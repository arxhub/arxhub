import { Plugin, type PluginArgs } from '@arxhub/core'
import type { ArxHub } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { PanelStoreExtension, PanelsLayout, type LayoutLeaf, type LayoutSplit } from '@arxhub/plugin-panels/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { FolderOpen } from 'lucide-vue-next'
import { ExplorerExtension } from './explorer-extension'
import { manifest } from './manifest'
import FileTreeView from './ui/FileTreeView.vue'

type ExplorerPluginArgs = PluginArgs & {
  vfs: VirtualFileSystem
  root?: string
}

export class ExplorerPlugin extends Plugin<ArxHub> {
  private readonly vfs: VirtualFileSystem
  private readonly root: string

  constructor(args: ExplorerPluginArgs) {
    super(args, manifest)
    this.vfs = args.vfs
    this.root = args.root ?? '/'
  }

  override create(arxhub: ArxHub): void {
    super.create(arxhub)
    arxhub.extensions.register(ExplorerExtension, () => ({
      vfs: this.vfs,
      root: this.root,
    }))
  }

  override configure(arxhub: ArxHub): void {
    super.configure(arxhub)

    const { store } = arxhub.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: 'arxhub.explorer.file-tree',
      title: 'Explorer',
      component: FileTreeView,
    })

    const shell = arxhub.extensions.get(ShellExtension)
    shell.sidebar.register({
      id: 'arxhub.explorer',
      icon: FolderOpen,
      title: 'Explorer',
      layout: PanelsLayout,
      order: 0,
    })
  }

  override async start(arxhub: ArxHub): Promise<void> {
    await super.start(arxhub)

    const { store } = arxhub.extensions.get(PanelStoreExtension)
    const ext = arxhub.extensions.get(ExplorerExtension)

    store.openPanel('arxhub.explorer.file-tree')

    const leaf = store.layout.value as LayoutLeaf
    const ftGroupId = leaf.groupId
    const contentGroupId = store.splitGroup(ftGroupId, 'horizontal')

    const split = store.layout.value as LayoutSplit
    store.setRatio(split.splitId, 0.25)

    ext.contentGroupId = contentGroupId
  }
}
