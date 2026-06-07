import { basename, dirname, extname } from '@arxhub/path'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { modals } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import type { InjectionKey } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'

// Provided by FileTreeView so a row can register itself as the target of the single shared
// context menu on right-click.
export const SetContextTargetKey: InjectionKey<(node: TreeNode) => void> = Symbol('explorer-context-target')

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

  return { openFile, newFile, newFolder, startRename, confirmDelete }
}
