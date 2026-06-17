import { basename, dirname, extname } from '@arxhub/path'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'

export function useFileActions() {
  const arxhub = useArxHub()
  const explorer = arxhub.extensions.get(ExplorerExtension)
  const { store } = arxhub.extensions.get(PanelStoreExtension)

  // Action descriptors are fire-and-forget (the menu/modal invokers don't await onSelect/onConfirm),
  // so every async action routes through here: a rejection is logged, not left to surface as an
  // unhandled promise rejection.
  function runAction(action: Promise<void>, context: string): void {
    action.catch((error) => arxhub.logger.error(`[explorer] ${context} failed:`, error))
  }

  function openFile(node: TreeNode, preview: boolean): void {
    const path = node.entry.pathname
    const panels = store.getPanelsForFile(extname(path))
    if (panels.length === 0) return

    // Already open somewhere → focus it. A permanent open also promotes an existing preview tab.
    for (const [groupId, group] of Object.entries(store.groups.value)) {
      const instance = group.instances.find((i) => i.props?.path === path)
      if (instance) {
        store.activateGroup(groupId)
        store.activatePanel(instance.instanceId, groupId)
        if (!preview && instance.preview) store.promotePanel(instance.instanceId, groupId)
        return
      }
    }

    store.openPanel(panels[0].id, { path }, basename(path), explorer.contentGroupId ?? undefined, preview)
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
      onConfirm: () => runAction(explorer.deleteEntry(node.entry.pathname), `delete ${node.entry.pathname}`),
    })
  }

  // Presentation-agnostic action descriptors — consumed by the desktop context menu now and a
  // mobile bottom-sheet later (uikit's ActionMenuHost decides how to render them).
  function getNodeActions(node: TreeNode): ActionItem[] {
    if (node.entry.kind === 'file') {
      return [
        { id: 'open', label: 'Open', icon: 'lu:file-plus', onSelect: () => openFile(node, false) },
        { id: 'rename', label: 'Rename', icon: 'lu:pencil', onSelect: () => startRename(node) },
        { id: 'delete', label: 'Delete', icon: 'lu:trash-2', variant: 'danger', onSelect: () => confirmDelete(node) },
      ]
    }
    return [
      { id: 'new-file', label: 'New File', icon: 'lu:file-plus', onSelect: () => runAction(newFile(node), 'new file') },
      { id: 'new-folder', label: 'New Folder', icon: 'lu:folder-plus', onSelect: () => runAction(newFolder(node), 'new folder') },
      { id: 'rename', label: 'Rename', icon: 'lu:pencil', onSelect: () => startRename(node) },
      { id: 'delete', label: 'Delete', icon: 'lu:trash-2', variant: 'danger', onSelect: () => confirmDelete(node) },
    ]
  }

  function getRootActions(): ActionItem[] {
    return [
      {
        id: 'new-file',
        label: 'New File',
        icon: 'lu:file-plus',
        onSelect: () => runAction(explorer.createFile(explorer.root, 'untitled.arx'), 'new file'),
      },
      {
        id: 'new-folder',
        label: 'New Folder',
        icon: 'lu:folder-plus',
        onSelect: () => runAction(explorer.createDir(explorer.root, 'new-folder'), 'new folder'),
      },
    ]
  }

  return { openFile, newFile, newFolder, startRename, confirmDelete, getNodeActions, getRootActions }
}
