import { basename } from '@arxhub/path'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'

export interface OpenDocument {
  // Puts a document in front of the owner. `blockId` is where in it to go — the block a snippet came from
  // — and a panel that cannot jump to a block simply opens the document from the top (FR-233).
  open(path: string, blockId?: string | null): void
}

// Search does not know about editors: it asks the "Notes" type which viewer claims the file and hands
// the file over. The one thing it does know is that a document already on screen is the one to
// activate — a second instance of one file is two editors over one set of bytes (FR-233).
export function useOpenDocument(): OpenDocument {
  const arxhub = useArxHub()
  const notes = arxhub.extensions.get(NotesExtension)
  const { store } = arxhub.extensions.get(PanelStoreExtension)

  function open(path: string, blockId?: string | null): void {
    for (const [groupId, group] of Object.entries(store.groups.value)) {
      const instance = group.instances.find((candidate) => candidate.props?.path === path)
      if (instance == null) continue
      store.activateGroup(groupId)
      store.activatePanel(instance.instanceId, groupId)
      return
    }

    // The same registry the tree asks, so one file gets one answer everywhere in the application.
    const viewer = notes.viewerFor(path)
    if (viewer == null) {
      // A found document that cannot be opened is still a real answer — the search worked, the workspace
      // has nothing that reads this format. Saying so beats a click that does nothing.
      toaster.create({ title: 'Nothing can open this file', description: path, type: 'error' })
      return
    }

    store.openPanel(viewer.panelId, { path, ...(blockId != null && blockId !== '' ? { blockId } : {}) }, basename(path))
  }

  return { open }
}
