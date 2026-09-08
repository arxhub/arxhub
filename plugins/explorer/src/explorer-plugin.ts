import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { basename } from '@arxhub/path'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { VaultVfs } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { ExplorerExtension } from './explorer-extension'
import { manifest } from './manifest'
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

    // The tree is the navigation of the "Notes" type, not a place of its own — and now that both
    // frames read the type registry, that is the ONLY way it reaches the screen. The mini-app
    // registration that stood beside it is gone with them (F-21): a second "Explorer" in the type row,
    // whose content was the same tree beside the same panels, would have been the old model wearing
    // the new row.
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
  }
}
