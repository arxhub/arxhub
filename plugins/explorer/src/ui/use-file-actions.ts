import { basename, dirname } from '@arxhub/path'
import { NOTES_TYPE_ID } from '@arxhub/plugin-notes'
import { ShellExtension } from '@arxhub/plugin-shell'
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { canOpenExternally, openExternally, type VirtualFileSystem } from '@arxhub/vfs'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'
import { describeImport } from '../import-files'
import { pickFiles } from './pick-files'

// Pure so the rule is unit-testable without the Vue plumbing the composable needs: a file (not a
// directory), not pending (a file left in the cloud has nothing on disk to hand over), and the vault's
// own backend actually declares the capability — a browser backend must never offer an action it
// cannot honour.
export function offersExternalOpen(node: TreeNode, vfs: VirtualFileSystem): boolean {
  return node.entry.kind === 'file' && !node.pending && canOpenExternally(vfs)
}

// The toast's second line. A VFS error carries the useful part in its message ('Unauthorized' for a
// server that refused this device, 'Not Found' for a path that vanished under us); anything without one
// still has to say something rather than render 'undefined'.
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.trim() || 'The reason was not reported — see the log.'
}

export function useFileActions() {
  const arxhub = useArxHub()
  const explorer = arxhub.extensions.get(ExplorerExtension)
  const shell = arxhub.extensions.get(ShellExtension)
  const navHost = useNavHost()

  // Action descriptors are fire-and-forget (the menu/modal invokers don't await onSelect/onConfirm),
  // so every async action routes through here: a rejection is logged, not left to surface as an
  // unhandled promise rejection.
  //
  // It also toasts. Every one of these actions was started by a click and changes what the tree shows,
  // so a failure that only reached the log left the user watching a tree that silently did not change —
  // a rejected write reads exactly like a button that does nothing.
  // `context` is a verb phrase ('create the file', 'rename to notes.md') so it reads in both places.
  function runAction(action: Promise<unknown>, context: string): void {
    action.catch((error) => {
      arxhub.logger.error(`[explorer] failed to ${context}:`, error)
      toaster.create({ title: `Could not ${context}`, description: reasonOf(error), type: 'error' })
    })
  }

  // Whatever it is, it opens: a file nothing claims lands on the type's own "nothing can open this"
  // panel, which names the file and stays put. The toast that used to refuse here vanished in seconds
  // and left the tree looking as if the click had done nothing.
  async function openPath(path: string): Promise<void> {
    await shell.workspace.openObject(NOTES_TYPE_ID, { id: path })
    navHost?.navigated?.()
  }

  function openFile(node: TreeNode): void {
    runAction(openPath(node.entry.pathname), 'open the file')
  }

  async function createFile(parent: string, extension = '.arx'): Promise<void> {
    const path = await explorer.createFile(parent, `untitled${extension}`)
    await openPath(path)
  }

  async function newFile(node: TreeNode): Promise<void> {
    const parent = node.entry.kind === 'dir' ? node.entry.pathname : dirname(node.entry.pathname)
    await createFile(parent)
  }

  // OR-07. The picker is opened before anything is awaited — see pick-files.ts for why that ordering is
  // not a style choice. The success toast is raised here rather than inside the extension: a failure
  // already has one road out (runAction, below), and this is the other half of the same report — a
  // rename is the one thing the tree alone does not tell, since the row it draws is under the new name.
  async function addFiles(parent: string): Promise<void> {
    const picked = await pickFiles()
    if (picked.length === 0) return
    toaster.create({ ...describeImport(await explorer.importFiles(parent, picked)), type: 'success' })
  }

  function addFilesAction(parent: string): ActionItem {
    return { id: 'add-files', label: 'Add files…', icon: 'lu:file-up', onSelect: () => runAction(addFiles(parent), 'add the files') }
  }

  async function newFolder(node: TreeNode): Promise<void> {
    const parent = node.entry.kind === 'dir' ? node.entry.pathname : dirname(node.entry.pathname)
    await explorer.createDir(parent, 'new-folder')
  }

  function startRename(node: TreeNode): void {
    explorer.renamingPath.value = node.entry.pathname
  }

  function confirmDelete(node: TreeNode): void {
    const name = basename(node.entry.pathname)
    modals.openConfirmModal({
      title: 'Delete',
      content: `Delete "${name}"? This action cannot be undone.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { danger: true },
      onConfirm: () => runAction(explorer.deleteEntry(node.entry.pathname), `delete ${name}`),
    })
  }

  // A contributed action that opens an object elsewhere (`opensObject: true`) puts the mobile files
  // panel away the same way a plain tap on the row already does (`openFile`, below) — the picker over
  // the row is not where the thing it opened is. Built-ins that act on the row IN PLACE (rename needs
  // its inline input still on screen, delete and the New… actions have nothing elsewhere to reveal)
  // are untouched.
  function closeNavAfter(action: ActionItem): ActionItem {
    if (!action.opensObject) return action
    return {
      ...action,
      onSelect: () => {
        action.onSelect()
        navHost?.navigated?.()
      },
    }
  }

  // Presentation-agnostic action descriptors — consumed by the desktop context menu now and a
  // mobile bottom-sheet later (uikit's ActionMenuHost decides how to render them).
  function getNodeActions(node: TreeNode): ActionItem[] {
    // Contributed actions (from other plugins via ExplorerExtension.registerNodeActions) follow
    // the built-ins so destructive built-ins stay in their familiar place.
    if (node.entry.kind === 'file') {
      return [
        { id: 'open', label: 'Open', icon: 'lu:file-plus', onSelect: () => openFile(node), opensObject: true },
        ...(offersExternalOpen(node, explorer.vfs)
          ? [
              {
                id: 'open-externally',
                label: 'Open in system app',
                icon: 'lu:external-link',
                onSelect: () => runAction(openExternally(explorer.vfs, node.entry.pathname), 'open the file in the system app'),
              } satisfies ActionItem,
            ]
          : []),
        { id: 'rename', label: 'Rename', icon: 'lu:pencil', onSelect: () => startRename(node) },
        { id: 'delete', label: 'Delete', icon: 'lu:trash-2', variant: 'danger', onSelect: () => confirmDelete(node) },
        ...explorer.getContributedActions(node).map(closeNavAfter),
      ]
    }
    return [
      { id: 'new-file', label: 'New File', icon: 'lu:file-plus', onSelect: () => runAction(newFile(node), 'create the file') },
      { id: 'new-folder', label: 'New Folder', icon: 'lu:folder-plus', onSelect: () => runAction(newFolder(node), 'create the folder') },
      // A folder's own menu is how the owner says "here" — the strip's button acts on the selection,
      // which is a different sentence.
      addFilesAction(node.entry.pathname),
      { id: 'rename', label: 'Rename', icon: 'lu:pencil', onSelect: () => startRename(node) },
      { id: 'delete', label: 'Delete', icon: 'lu:trash-2', variant: 'danger', onSelect: () => confirmDelete(node) },
      ...explorer.getContributedActions(node).map(closeNavAfter),
    ]
  }

  function getRootActions(): ActionItem[] {
    return [
      ...getTemplateActions(explorer.root),
      {
        id: 'new-file',
        label: 'New File',
        icon: 'lu:file-plus',
        onSelect: () => runAction(createFile(explorer.root), 'create the file'),
      },
      {
        id: 'new-folder',
        label: 'New Folder',
        icon: 'lu:folder-plus',
        onSelect: () => runAction(explorer.createDir(explorer.root, 'new-folder'), 'create the folder'),
      },
      addFilesAction(explorer.root),
    ]
  }

  function getTemplateActions(parent: string): ActionItem[] {
    return explorer.fileTemplates.value.map((template) => ({
      id: `new:${template.extension}`,
      label: template.label,
      icon: template.icon,
      onSelect: () => runAction(createFile(parent, template.extension), 'create the file'),
    }))
  }

  function getCreationActions(parent: string): ActionItem[] {
    return [
      { id: 'new-document', label: 'New document', icon: 'lu:file-plus', onSelect: () => runAction(createFile(parent), 'create the file') },
      ...getTemplateActions(parent),
    ]
  }

  // runAction is part of the surface: the toolbar and the inline rename start the same actions from a
  // plain click, and each one that reported failures on its own is one that could stop.
  return {
    openFile,
    createFile,
    addFiles,
    newFile,
    newFolder,
    startRename,
    confirmDelete,
    getNodeActions,
    getRootActions,
    getCreationActions,
    runAction,
  }
}
