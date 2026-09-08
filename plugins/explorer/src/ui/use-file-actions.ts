import { basename, dirname } from '@arxhub/path'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
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
  const notes = arxhub.extensions.get(NotesExtension)
  const { store } = arxhub.extensions.get(PanelStoreExtension)

  // Action descriptors are fire-and-forget (the menu/modal invokers don't await onSelect/onConfirm),
  // so every async action routes through here: a rejection is logged, not left to surface as an
  // unhandled promise rejection.
  //
  // It also toasts. Every one of these actions was started by a click and changes what the tree shows,
  // so a failure that only reached the log left the user watching a tree that silently did not change —
  // a rejected write reads exactly like a button that does nothing.
  // `context` is a verb phrase ('create the file', 'rename to notes.md') so it reads in both places.
  function runAction(action: Promise<void>, context: string): void {
    action.catch((error) => {
      arxhub.logger.error(`[explorer] failed to ${context}:`, error)
      toaster.create({ title: `Could not ${context}`, description: reasonOf(error), type: 'error' })
    })
  }

  function openFile(node: TreeNode): void {
    const path = node.entry.pathname

    // Already open somewhere → focus it, rather than opening a second editor over one set of bytes.
    for (const [groupId, group] of Object.entries(store.groups.value)) {
      const instance = group.instances.find((i) => i.props?.path === path)
      if (instance) {
        store.activateGroup(groupId)
        store.activatePanel(instance.instanceId, groupId)
        return
      }
    }

    // What opens a file is the type's question, not the panel layout's — the same registry search asks,
    // so one file gets one answer everywhere in the application.
    const viewer = notes.viewerFor(path)
    if (viewer == null) {
      // A row of the tree that nothing can open is still a real file — the vault has it, the workspace
      // has nothing that reads this format. A click that silently did nothing was indistinguishable
      // from a broken tree. Same wording as search's own refusal: one concept, one phrasing.
      toaster.create({ title: 'Nothing can open this file', description: path, type: 'error' })
      return
    }

    store.openPanel(viewer.panelId, { path }, basename(path))
  }

  async function newFile(node: TreeNode): Promise<void> {
    const parent = node.entry.kind === 'dir' ? node.entry.pathname : dirname(node.entry.pathname)
    await explorer.createFile(parent, 'untitled.arx')
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
      {
        id: 'new-file',
        label: 'New File',
        icon: 'lu:file-plus',
        onSelect: () => runAction(explorer.createFile(explorer.root, 'untitled.arx'), 'create the file'),
      },
      {
        id: 'new-folder',
        label: 'New Folder',
        icon: 'lu:folder-plus',
        onSelect: () => runAction(explorer.createDir(explorer.root, 'new-folder'), 'create the folder'),
      },
    ]
  }

  // runAction is part of the surface: the toolbar and the inline rename start the same actions from a
  // plain click, and each one that reported failures on its own is one that could stop.
  return { openFile, newFile, newFolder, startRename, confirmDelete, getNodeActions, getRootActions, runAction }
}
