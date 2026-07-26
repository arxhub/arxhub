import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import { SQL_CONSOLE_PANEL } from '../contributions'

export interface OpenConsole {
  open(): void
}

// Puts the SQL console in front of the owner. One console, not one per click: a second instance would hold
// a second copy of a query text that is stored per device anyway, so an open one is activated instead.
export function useOpenConsole(): OpenConsole {
  const arxhub = useArxHub()
  const { store } = arxhub.extensions.get(PanelStoreExtension)

  function open(): void {
    for (const [groupId, group] of Object.entries(store.groups.value)) {
      const instance = group.instances.find((candidate) => candidate.definitionId === SQL_CONSOLE_PANEL)
      if (instance == null) continue
      store.activateGroup(groupId)
      store.activatePanel(instance.instanceId, groupId)
      if (instance.preview === true) store.promotePanel(instance.instanceId, groupId)
      return
    }
    store.openPanel(SQL_CONSOLE_PANEL, {}, 'SQL console')
  }

  return { open }
}
