import { panelStore } from './panel-store'
import type { PanelStore } from './types'

export function usePanels(): PanelStore {
  return panelStore
}
