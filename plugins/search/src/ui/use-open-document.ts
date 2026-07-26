import { basename, extname } from '@arxhub/path'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'

export interface OpenDocument {
  // Puts a document in front of the owner. `blockId` is where in it to go — the block a snippet came from
  // — and a panel that cannot jump to a block simply opens the document from the top (FR-233).
  open(path: string, blockId?: string | null): void
}

// Search does not know about editors: it asks the workspace which panel claims the file's extension and
// hands the file over. The one thing it does know is that a document already on screen is the one to
// activate — a second instance of one file is two editors over one set of bytes (FR-233).
export function useOpenDocument(): OpenDocument {
  const arxhub = useArxHub()
  const { store } = arxhub.extensions.get(PanelStoreExtension)

  function open(path: string, blockId?: string | null): void {
    for (const [groupId, group] of Object.entries(store.groups.value)) {
      const instance = group.instances.find((candidate) => candidate.props?.path === path)
      if (instance == null) continue
      store.activateGroup(groupId)
      store.activatePanel(instance.instanceId, groupId)
      // Opening from a search result is a deliberate act, so the tab stops being the ephemeral one that
      // the next preview would reuse.
      if (instance.preview === true) store.promotePanel(instance.instanceId, groupId)
      return
    }

    const panels = store.getPanelsForFile(extname(path))
    if (panels.length === 0) {
      // A found document that cannot be opened is still a real answer — the search worked, the workspace
      // has nothing that reads this format. Saying so beats a click that does nothing.
      toaster.create({ title: 'Nothing can open this file', description: path, type: 'error' })
      return
    }

    store.openPanel(panels[0].id, { path, ...(blockId != null && blockId !== '' ? { blockId } : {}) }, basename(path))
  }

  return { open }
}
