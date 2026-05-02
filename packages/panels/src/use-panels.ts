import { useArxHub } from '@arxhub/uikit/hooks'
import { PanelStoreExtension } from './panel-store-extension'
import type { PanelStore } from './types'

export function usePanels(): PanelStore {
  return useArxHub().extensions.get(PanelStoreExtension).store
}
