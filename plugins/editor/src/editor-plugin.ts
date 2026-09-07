import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { basename, dirname } from '@arxhub/path'
import { ExplorerExtension, type TreeNode } from '@arxhub/plugin-explorer/ui'
import { type PanelStore, PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { VaultVfs, type VirtualFileSystem } from '@arxhub/vfs'
import { serialize } from './editor-format'
import { manifest } from './manifest'
import { arxPathFor, isMarkdownPath, markdownToArx } from './md-to-arx'
import EditorPanel from './ui/EditorPanel.vue'

const PANEL_ID = 'arxhub.editor'

export class EditorPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const { store } = ctx.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: PANEL_ID,
      title: 'Editor',
      component: EditorPanel,
      handles: ['.arx'],
    })

    // The conversion is offered where the note is — as an action on the file itself, through the
    // explorer's contribution channel rather than an import in either direction. A build without the
    // explorer (the headless server) simply never offers it.
    if (!ctx.extensions.has(ExplorerExtension)) return
    const explorer = ctx.extensions.get(ExplorerExtension)
    const vault = ctx.services.get(VaultVfs)
    explorer.registerNodeActions((node) => this.conversionAction(node, explorer, store, vault))
  }

  private conversionAction(node: TreeNode, explorer: ExplorerExtension, store: PanelStore, vault: VirtualFileSystem): ActionItem[] {
    if (node.entry.kind !== 'file' || !isMarkdownPath(node.entry.pathname)) return []
    const path = node.entry.pathname
    return [
      {
        id: 'convert-to-arx',
        label: 'Convert to .arx',
        icon: 'lu:file-symlink',
        onSelect: () => {
          // Menu invokers don't await onSelect, so a failure that reached only the log would read as a
          // menu entry that does nothing — the same policy as the explorer's own runAction.
          this.convert(path, explorer, store, vault).catch((error) => {
            this.logger.error(`[editor] failed to convert ${path} to .arx:`, error)
            toaster.create({ title: 'Could not convert to .arx', description: reasonOf(error), type: 'error' })
          })
        },
      },
    ]
  }

  // The markdown note is never touched: converting ADDS `<name>.arx` beside it and leaves the original
  // for the owner to keep or delete. A conversion that consumed the source would make an irreversible
  // decision on the user's behalf — and markdown staying readable and editable as text is A-1.
  private async convert(path: string, explorer: ExplorerExtension, store: PanelStore, vault: VirtualFileSystem): Promise<void> {
    const target = arxPathFor(path)
    if (await vault.exists(target)) {
      const replace = await confirmReplace(basename(target))
      if (!replace) return
    }

    const markdown = new TextDecoder().decode(await vault.read(path))
    const { doc, warnings } = markdownToArx(markdown)

    // An open panel holds its own copy of the document and autosaves it, so replacing the file under
    // one would have the tab write the pre-conversion state straight back over the conversion. Closing
    // it first cancels that pending write (the panel cancels its autosave on unmount); it is reopened
    // on the fresh file below, so the tab ends up where it was, showing what was just written.
    closePanelsFor(store, target)

    await vault.write(target, new TextEncoder().encode(serialize(doc)))
    await explorer.refreshDir(dirname(target))

    const name = basename(target)
    store.openPanel(PANEL_ID, { path: target }, name, undefined, false)

    // What markdown said and the document format cannot say is the user's to know about — the toast
    // carries the count so it stays one line, the log carries what each one was.
    if (warnings.length > 0) {
      for (const warning of warnings) this.logger.warn(`[editor] converting ${path}: ${warning}`)
      toaster.create({
        title: `Converted to ${name}`,
        description: `${basename(path)} was left in place. ${warnings.length} thing${warnings.length === 1 ? '' : 's'} markdown says could not be kept as-is — see the log.`,
        type: 'warning',
      })
      return
    }
    toaster.create({ title: `Converted to ${name}`, description: `${basename(path)} was left in place.`, type: 'success' })
  }
}

function closePanelsFor(store: PanelStore, path: string): void {
  for (const group of Object.values(store.groups.value)) {
    for (const instance of [...group.instances]) {
      if (instance.props?.path === path) store.closePanel(instance.instanceId, group.id)
    }
  }
}

// Escape and a click outside close a dialog through onClose without ever calling onCancel, so the
// answer is settled from the one callback every dismissal path runs. A dismissal is a "no".
function confirmReplace(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false
    modals.openConfirmModal({
      title: 'Replace file',
      content: `"${name}" already exists. Replace it with the converted note?`,
      labels: { confirm: 'Replace', cancel: 'Cancel' },
      confirmProps: { danger: true },
      onConfirm: () => {
        confirmed = true
      },
      onClose: () => resolve(confirmed),
    })
  })
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.trim() || 'The reason was not reported — see the log.'
}
