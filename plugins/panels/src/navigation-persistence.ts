import type { Json, Workspace, WorkspaceStorage } from '@arxhub/plugin-shell'
import { watch } from 'vue'
import type { PanelStoreExtension } from './panel-store-extension'
import type { LayoutNode, PanelWorkspaceState } from './types'
import { parsePanelWorkspace } from './workspace-persistence'

// Keep the old record as a rollback copy. Document buffers and layouts now belong to Workspace;
// utility panels have no object snapshots and keep their small, separate record.
const UTILITY_KEY = 'arxhub.panels.utilities'
const MIGRATED_KEY = 'arxhub.panels.migrated'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* The live desk does not depend on storage. */
  }
}

export async function restoreNavigationWorkspace(
  panels: PanelStoreExtension,
  workspace: Workspace,
  storage: WorkspaceStorage,
  typeId: string,
): Promise<void> {
  panels.stopLegacyPersistence()
  const store = panels.store
  const legacy = store.serialize()
  const migrate = read(MIGRATED_KEY) == null
  const paths = new Map<string, string>()
  if (migrate) {
    for (const group of Object.values(legacy.groups)) {
      for (const instance of group.instances) {
        if (typeof instance.props?.path === 'string') paths.set(instance.instanceId, instance.props.path)
      }
    }
  }
  let utilities = legacy
  if (!migrate) {
    try {
      const saved = read(UTILITY_KEY)
      utilities = (saved == null ? null : parsePanelWorkspace(JSON.parse(saved))) ?? { groups: {}, layout: null, activeGroupId: null }
    } catch {
      utilities = { groups: {}, layout: null, activeGroupId: null }
    }
  }
  const utilityGroups = Object.fromEntries(
    Object.entries(utilities.groups).map(([id, group]) => [
      id,
      {
        ...group,
        instances: group.instances.filter((it) => it.props?.path == null && it.props?.hostedKey == null),
      },
    ]),
  )
  store.restore({ ...utilities, groups: utilityGroups })
  const restored = await storage.restore()
  if (!restored) workspace.activateType(typeId)

  if (paths.size > 0) {
    const state = workspace.serialize()
    const existing = state.types.find((type) => type.id === typeId)
    const tabs = existing?.tabs ?? []
    const known = new Set(tabs.map((tab) => tab.key))
    for (const path of paths.values()) {
      if (known.has(path)) continue
      known.add(path)
      tabs.push({ key: path, title: path.split('/').pop() ?? path, object: { path } })
    }
    const layoutOf = (node: LayoutNode): Json => {
      if (node.type === 'split')
        return { d: node.direction === 'horizontal' ? 'h' : 'v', r: node.ratio, a: layoutOf(node.first), b: layoutOf(node.second) }
      const group = legacy.groups[node.groupId]
      return {
        keys: group.instances.map((it) => paths.get(it.instanceId) ?? it.instanceId),
        active: paths.get(group.activeInstanceId ?? '') ?? group.activeInstanceId,
      }
    }
    const activeId = legacy.activeGroupId == null ? null : legacy.groups[legacy.activeGroupId]?.activeInstanceId
    const migrated = {
      id: typeId,
      tabs,
      activeKey: paths.get(existing?.activeKey ?? '') ?? existing?.activeKey ?? paths.get(activeId ?? '') ?? activeId ?? null,
      layout: existing?.layout ?? (legacy.layout == null ? null : layoutOf(legacy.layout)),
    }
    // restore() rebuilds objects. Clear the first pass before reviving the merged snapshot.
    for (const key of workspace.panelsOf(typeId)?.keys() ?? []) {
      if (workspace.objectOf(typeId, key)?.props.path != null) workspace.panelsOf(typeId)?.close(key)
    }
    await workspace.restore({ ...state, types: [...state.types.filter((type) => type.id !== typeId), migrated] })
  }
  storage.save()

  const persist = (): void => {
    const saved = storage.save()
    const state = store.serialize()
    const utility: PanelWorkspaceState = {
      ...state,
      groups: Object.fromEntries(
        Object.entries(state.groups).map(([id, group]) => [
          id,
          {
            ...group,
            instances: group.instances.filter((it) => it.props?.hostedKey == null),
          },
        ]),
      ),
    }
    write(UTILITY_KEY, JSON.stringify(utility))
    // Commit the migration only after a document snapshot reached storage.
    if (saved) write(MIGRATED_KEY, '1')
  }
  persist()
  watch(() => store.serialize(), persist, { deep: true })
}
