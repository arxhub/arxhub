import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import { SQL_CONSOLE_PANEL } from '../contributions'

export interface OpenConsole {
  open(): void
}

// Puts the SQL console in front of the owner. One console, not one per click: a second instance would hold
// a second copy of a query text that is stored per device anyway, so an open one is activated instead —
// openPanel's own dedupe does the scan-and-activate; this only names which existing instance counts.
export function useOpenConsole(): OpenConsole {
  const arxhub = useArxHub()
  const { store } = arxhub.extensions.get(PanelStoreExtension)

  function open(): void {
    store.openPanel(SQL_CONSOLE_PANEL, {}, 'SQL console', undefined, false, () => true)
  }

  return { open }
}
