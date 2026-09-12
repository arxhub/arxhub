import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { basename, dirname } from '@arxhub/path'
import { ExplorerExtension, type TreeNode } from '@arxhub/plugin-explorer/ui'
import { HotkeysExtension } from '@arxhub/plugin-hotkeys/ui'
import { NOTES_TYPE_ID, NotesExtension, type NoteViewer } from '@arxhub/plugin-notes/ui'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { SearchExtension } from '@arxhub/plugin-search/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { PluginVfs, VaultVfs, type VirtualFileSystem } from '@arxhub/vfs'
import { nextTick } from 'vue'
import { createAssetStore } from './assets'
import { searchDataSources } from './data-sources'
import { createDraftStore } from './document-drafts'
import { createHistoryStore } from './document-history'
import { createDocumentLinkStore } from './document-link-store'
import { ArxEditorExtension } from './editor-extension'
import { serialize } from './editor-format'
import { declareProseMirrorChords } from './hotkeys'
import { manifest } from './manifest'
import { arxPathFor, isMarkdownPath, markdownToArx } from './md-to-arx'
import ArxEditor from './ui/ArxEditor.vue'

const PANEL_ID = 'arxhub.editor'

// An editor is a way to show an object, not a place of its own: what it can show is declared as a
// viewer of the "Notes" type, so picking one by extension stops being the panel layout's business.
//
// No `dock`: this editor's tool bar carries Save and the edit history and lives inside the component,
// above the document's own text.
export const EDITOR_VIEWER: NoteViewer = {
  id: PANEL_ID,
  // The panel this viewer opens through while the frames still open through the panel store. Stated
  // rather than derived from `id`: the two strings are equal today, and a lookup that relied on that
  // would break silently the day one of them changed.
  panelId: PANEL_ID,
  title: 'Document',
  extensions: ['.arx'],
  component: ArxEditor,
  // Ahead of the plain text editor, so a format with a richer viewer is not claimed by the plain one.
  order: 0,
}

export class ArxEditorPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(ArxEditorExtension)
  }

  override start(ctx: PluginContext): Promise<void> {
    ctx.extensions.get(ArxEditorExtension).seal()
    return super.start(ctx)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    ctx.extensions.get(ArxEditorExtension).assets ??= createAssetStore(ctx.services.get(VaultVfs))
    const editor = ctx.extensions.get(ArxEditorExtension)
    if (ctx.extensions.has(SearchExtension))
      editor.register({ id: 'arxhub.search-data', dataSources: searchDataSources(ctx.extensions.get(SearchExtension)) })
    const keyring = ctx.extensions.has(KeyringExtension) ? ctx.extensions.get(KeyringExtension).keyring : null
    if (keyring) editor.drafts ??= createDraftStore(keyring.encryptionKey, keyring.authPublicKey)
    editor.history ??= createHistoryStore(ctx.services.get(PluginVfs).storage)
    editor.links ??= createDocumentLinkStore(
      ctx.services.get(VaultVfs),
      () => editor.kit.schema,
      async (path, anchor) => {
        await ctx.extensions.get(ShellExtension).workspace.openObject(NOTES_TYPE_ID, {
          id: path,
          ...(anchor ? { at: { ...anchor } } : {}),
        })
      },
      ctx.extensions.has(SearchExtension) ? ctx.extensions.get(SearchExtension) : undefined,
      (path) => ctx.extensions.get(NotesExtension).beforeClose(path),
      () => editor.kit.format,
    )

    // Both registrations stand side by side on purpose, and not for long. The viewer registry is what
    // decides WHICH editor opens a file; the panel definition is still what mounts it, and stays until
    // the frames read the type registry (F-14/F-16). Dropping it before that takes this editor off the
    // screen.
    const { store } = ctx.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: EDITOR_VIEWER.panelId,
      title: 'ArxEditor',
      component: ArxEditor,
    })

    ctx.extensions.get(NotesExtension).registerViewer(EDITOR_VIEWER)

    // Beside the viewer, and for the same reason: both say what this editor IS, independently of
    // whether a panel showing one is open.
    declareProseMirrorChords(ctx.extensions.get(HotkeysExtension))

    // The conversion is offered where the note is — as an action on the file itself, through the
    // explorer's contribution channel rather than an import in either direction. A build without the
    // explorer (the headless server) simply never offers it.
    if (!ctx.extensions.has(ExplorerExtension)) return
    const explorer = ctx.extensions.get(ExplorerExtension)
    const vault = ctx.services.get(VaultVfs)
    explorer.registerNodeActions((node) => this.conversionAction(node, explorer, ctx.extensions.get(ShellExtension), vault))
  }

  private conversionAction(node: TreeNode, explorer: ExplorerExtension, shell: ShellExtension, vault: VirtualFileSystem): ActionItem[] {
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
          this.convert(path, explorer, shell, vault).catch((error) => {
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
  private async convert(path: string, explorer: ExplorerExtension, shell: ShellExtension, vault: VirtualFileSystem): Promise<void> {
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
    shell.workspace.closeObject(NOTES_TYPE_ID, target, { discard: true })
    await nextTick()

    await vault.write(target, new TextEncoder().encode(serialize(doc)))
    await explorer.refreshDir(dirname(target))

    const name = basename(target)
    await shell.workspace.openObject(NOTES_TYPE_ID, { id: target })

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
