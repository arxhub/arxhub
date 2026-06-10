import { useArxHub } from '@arxhub/uikit/hooks'
import { type InjectionKey, inject } from 'vue'
import { PanelStoreExtension } from './panel-store-extension'
import type { PanelStore } from './types'

// Provided by PanelsLayout so a mini-app can host its own independent panel store.
// Falls back to the global singleton store when no PanelsLayout above provides one.
export const PanelStoreKey: InjectionKey<PanelStore> = Symbol('panel-store')

export function usePanels(): PanelStore {
  const injected = inject(PanelStoreKey, null)
  if (injected) return injected
  return useArxHub().extensions.get(PanelStoreExtension).store
}
