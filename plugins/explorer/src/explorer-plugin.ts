import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { DocumentsExtension } from '@arxhub/plugin-documents'
import { RepositoryExtension } from '@arxhub/plugin-repository'
import { modals } from '@arxhub/uikit/core'
import { VaultVfs, VaultWatcher } from '@arxhub/vfs'
import { markRaw, type WatchStopHandle } from 'vue'
import { ExplorerExtension } from './explorer-extension'
import { manifest } from './manifest'
import CreateFlowSheet from './ui/CreateFlowSheet.vue'
import FileTreeView from './ui/FileTreeView.vue'
import { pickFiles } from './ui/pick-files'

type ExplorerPluginArgs = PluginArgs & {
  root?: string
}

export class ExplorerPlugin extends Plugin {
  private readonly root: string
  // `ExplorerExtension` has no stop hook of its own — the plugin that started the watch is the one
  // that stops it.
  private stopPendingWatch: WatchStopHandle | null = null
  private stopVaultWatch: (() => void) | null = null

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
    const documents = ctx.extensions.get(DocumentsExtension)
    // A pending path is a phantom node under its directory (23-storage-model F-06) — read straight off
    // the repository's own extension, never its internals. Repository is essential (A-50) — no has()
    // guard needed: version history and pending nodes stand on it whether or not sync is switched on.
    this.stopPendingWatch = explorer.setPendingSource(ctx.extensions.get(RepositoryExtension))

    // OR-03: a row is named by whoever owns "what can open this" — the setting and the rule both live
    // with the type (DocumentsExtension.displayName), so the tree and the strip above an open document
    // cannot disagree about one file. Asked on every render rather than snapshotted here, so a plugin
    // switched off (its viewer never registered) loses its claim without this needing to know why.
    explorer.setDisplayNames((path) => documents.displayName(path))

    // The tree is the navigation of the "Documents" type, not a place of its own — and now that both
    // frames read the type registry, that is the ONLY way it reaches the screen. The mini-app
    // registration that stood beside it is gone with them (F-21): a second "Explorer" in the type row,
    // whose content was the same tree beside the same panels, would have been the old model wearing
    // the new row.
    documents.setNav(markRaw(FileTreeView))

    // Creation is intercepted here because the tree knows the place and the type does not: a note has
    // to land in the selected folder, and after the write the tree has to show it. The type on its own
    // creates in the root and knows about no refresh — the right fallback, not a breakage.
    documents.setCreator(async () => {
      const parent = explorer.selectedPath.value ?? explorer.root
      // '.arx' is the primary format (A-29) and `createFile` is what seeds it — an '.arx' reader
      // rejects a bare file.
      return explorer.createFile(parent, 'New note.arx')
    })

    // The phone's New asks what and where before it writes anything, and "where" is a picker over this
    // plugin's folders — so the flow is contributed from here, like the tree itself.
    documents.setCreateFlow({
      start: (folder) => void modals.openSurface({ component: CreateFlowSheet, props: { folder: folder ?? '' } }),
      menu: (folder) => [
        {
          id: 'explorer.new-folder',
          label: 'New folder',
          icon: 'lu:folder-plus',
          onSelect: () => void modals.openSurface({ component: CreateFlowSheet, props: { folder: folder ?? '', folderOnly: true } }),
        },
        {
          id: 'explorer.add-files',
          label: 'Add files…',
          icon: 'lu:file-up',
          // The chooser opens from the tap itself (pick-files.ts); the flow then only asks where.
          onSelect: () =>
            void pickFiles().then((files) => {
              if (files.length > 0) modals.openSurface({ component: CreateFlowSheet, props: { folder: folder ?? '', files } })
            }),
        },
      ],
    })
  }

  override start(ctx: PluginContext): Promise<void> {
    // A write reaches the vault from more places than the tree — the name above an open document, the
    // md → arx conversion, a sync round — and each one used to leave the row it changed stale until a
    // reload. One subscription, in the one place that can dispose it.
    this.stopVaultWatch = ctx.extensions.get(ExplorerExtension).watchVault(ctx.services.get(VaultWatcher))
    return super.start(ctx)
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopVaultWatch?.()
    this.stopVaultWatch = null
    this.stopPendingWatch?.()
    this.stopPendingWatch = null
    await super.stop(ctx)
  }
}
