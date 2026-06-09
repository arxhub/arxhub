import { basename, dirname, extname } from '@arxhub/path'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { type ActionItem, modals } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'

export function useFileActions() {
  const arxhub = useArxHub()
  const explorer = arxhub.extensions.get(ExplorerExtension)
  const { store } = arxhub.extensions.get(PanelStoreExtension)

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
      onConfirm: () => explorer.deleteEntry(node.entry.pathname),
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
      { id: 'new-file', label: 'New File', icon: 'lu:file-plus', onSelect: () => newFile(node) },
      { id: 'new-folder', label: 'New Folder', icon: 'lu:folder-plus', onSelect: () => newFolder(node) },
      { id: 'rename', label: 'Rename', icon: 'lu:pencil', onSelect: () => startRename(node) },
      { id: 'delete', label: 'Delete', icon: 'lu:trash-2', variant: 'danger', onSelect: () => confirmDelete(node) },
    ]
  }

  function getRootActions(): ActionItem[] {
    return [
      { id: 'new-file', label: 'New File', icon: 'lu:file-plus', onSelect: () => explorer.createFile(explorer.root, 'untitled.arx') },
      { id: 'new-folder', label: 'New Folder', icon: 'lu:folder-plus', onSelect: () => explorer.createDir(explorer.root, 'new-folder') },
    ]
  }

  return { openFile, newFile, newFolder, startRename, confirmDelete, getNodeActions, getRootActions }
}
