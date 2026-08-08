import { basename } from '@arxhub/path'
import type { VfsChange } from '@arxhub/vfs'
import type { PanelStore } from './types'

interface PanelLocation {
  instanceId: string
  groupId: string
}

function findPanelsForPath(store: PanelStore, path: string): PanelLocation[] {
  const found: PanelLocation[] = []
  for (const group of Object.values(store.groups.value)) {
    for (const instance of group.instances) {
      if (instance.props?.path === path) found.push({ instanceId: instance.instanceId, groupId: group.id })
    }
  }
  return found
}

// Keeps every open panel in step with the vault it is showing, regardless of who changed it — the file
// tree's own rename/delete, a rename that arrived through sync, or any other VFS writer. VaultWatcher
// already reports every one of those in one place, so this is the one listener that reacts to a vault
// change it did not cause itself (mirrors index-queue.ts for search).
//
// A delete closes the panel: the document is gone, and there is nothing left to retarget it to. A
// rename retargets it in place instead — same instanceId, so PanelView (keyed by instanceId, not path)
// never remounts the hosted editor over it; only `props.path`/`title` change reactively.
//
// Returns whether a panel was closed, so the caller can toast exactly once per delete. A rename never
// toasts and never closes anything — it is still the same document, just at a new path.
export function applyVaultChangeToPanels(store: PanelStore, change: VfsChange): boolean {
  switch (change.kind) {
    case 'deleted': {
      const matches = findPanelsForPath(store, change.pathname)
      for (const { instanceId, groupId } of matches) store.closePanel(instanceId, groupId)
      return matches.length > 0
    }
    case 'renamed': {
      // `from` is always set for a 'renamed' change (see VfsChange) — the guard is for the type, not a
      // case that happens in practice.
      if (change.from == null) return false
      const title = basename(change.pathname)
      for (const { instanceId, groupId } of findPanelsForPath(store, change.from)) {
        const group = store.groups.value[groupId]
        const instance = group?.instances.find((i) => i.instanceId === instanceId)
        if (instance == null) continue
        store.retargetPanel(instanceId, groupId, { ...instance.props, path: change.pathname }, title)
      }
      return false
    }
    case 'written':
      return false
  }
}
