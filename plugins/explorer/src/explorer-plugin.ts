import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { basename } from '@arxhub/path'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { VaultVfs } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { EXPLORER_SIDEBAR_ITEM, ExplorerExtension } from './explorer-extension'
import { manifest } from './manifest'
import ExplorerLayout from './ui/ExplorerLayout.vue'
import FileTreeView from './ui/FileTreeView.vue'

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

    const explorer = ctx.extensions.get(ExplorerExtension)
    const notes = ctx.extensions.get(NotesExtension)

    // The tree is the navigation of the "Notes" type, not a place of its own. That is the whole of
    // F-21 that can land before a frame reads the type registry: the mini-app registration below stays
    // until the two frames are rewritten on the new model (F-14/F-16), because it is the only thing
    // either frame reads today. Removing it now would take the file tree off the screen.
    notes.setNav(markRaw(FileTreeView))

    // Creation is intercepted here because the tree knows the place and the type does not: a note has
    // to land in the selected folder, and after the write the tree has to show it. The type on its own
    // creates in the root and knows about no refresh — the right fallback, not a breakage.
    notes.setCreator(async () => {
      const parent = explorer.selectedPath.value ?? explorer.root
      // '.arx' is the primary format (A-29) and `createFile` is what seeds it — an '.arx' reader
      // rejects a bare file.
      const path = await notes.freePath(parent, 'New note', '.arx')
      await explorer.createFile(parent, basename(path))
      return path
    })

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
