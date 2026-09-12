import { basename, dirname } from '@arxhub/path'
import { NOTES_TYPE_ID, NotesExtension } from '@arxhub/plugin-notes/ui'
import { ShellExtension, useNavHost } from '@arxhub/plugin-shell/ui'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'

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

  async function openPath(path: string): Promise<void> {
    if (arxhub.extensions.get(NotesExtension).viewerFor(path) == null) {
      toaster.create({ title: 'Nothing can open this file', description: path, type: 'error' })
      return
    }
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

  // Presentation-agnostic action descriptors — consumed by the desktop context menu now and a
  // mobile bottom-sheet later (uikit's ActionMenuHost decides how to render them).
  function getNodeActions(node: TreeNode): ActionItem[] {
    // Contributed actions (from other plugins via ExplorerExtension.registerNodeActions) follow
    // the built-ins so destructive built-ins stay in their familiar place.
    if (node.entry.kind === 'file') {
      return [
        { id: 'open', label: 'Open', icon: 'lu:file-plus', onSelect: () => openFile(node) },
        { id: 'rename', label: 'Rename', icon: 'lu:pencil', onSelect: () => startRename(node) },
        { id: 'delete', label: 'Delete', icon: 'lu:trash-2', variant: 'danger', onSelect: () => confirmDelete(node) },
        ...explorer.getContributedActions(node),
      ]
    }
    return [
      { id: 'new-file', label: 'New File', icon: 'lu:file-plus', onSelect: () => runAction(newFile(node), 'create the file') },
      { id: 'new-folder', label: 'New Folder', icon: 'lu:folder-plus', onSelect: () => runAction(newFolder(node), 'create the folder') },
      { id: 'rename', label: 'Rename', icon: 'lu:pencil', onSelect: () => startRename(node) },
      { id: 'delete', label: 'Delete', icon: 'lu:trash-2', variant: 'danger', onSelect: () => confirmDelete(node) },
      ...explorer.getContributedActions(node),
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
  return { openFile, createFile, newFile, newFolder, startRename, confirmDelete, getNodeActions, getRootActions, getCreationActions, runAction }
}
