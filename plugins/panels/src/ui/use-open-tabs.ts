import { type ComputedRef, computed } from 'vue'
import type { PanelInstance, PanelStore } from '../types'

export interface OpenTab {
  groupId: string
  instance: PanelInstance
  active: boolean
}

export interface OpenTabsList {
  openTabs: ComputedRef<OpenTab[]>
  current: ComputedRef<OpenTab | undefined>
  pathOf(instance: { props?: Record<string, unknown> }): string | null
  select(groupId: string, instanceId: string): void
}

// Shared by MobilePanels (the always-visible current-document strip) and OpenTabsList (an inline,
// selectable list of the same set — e.g. Explorer's mobile "Tabs" rail section) so the two never drift
// on what counts as "open" or "current".
export function useOpenTabsList(store: PanelStore): OpenTabsList {
  const openTabs = computed(() =>
    Object.entries(store.groups.value).flatMap(([groupId, group]) =>
      group.instances.map((instance) => ({
        groupId,
        instance,
        active: group.activeInstanceId === instance.instanceId && groupId === store.activeGroupId.value,
      })),
    ),
  )

  const current = computed(() => openTabs.value.find((tab) => tab.active) ?? openTabs.value[0])

  // File panels carry the path they were opened with; a settings page or the welcome panel does not.
  function pathOf(instance: { props?: Record<string, unknown> }): string | null {
    const path = instance.props?.path
    return typeof path === 'string' ? path : null
  }

  function select(groupId: string, instanceId: string): void {
    store.activateGroup(groupId)
    store.activatePanel(instanceId, groupId)
  }

  return { openTabs, current, pathOf, select }
}
