import { type InjectionKey, inject } from 'vue'

// Provided by PanelView so a hosted panel component can act on its own tab — notably
// promoting itself from a VSCode-style preview tab to a permanent one when edited.
export interface PanelInstanceContext {
  instanceId: string
  groupId: string
  promote: () => void
}

export const PanelInstanceKey: InjectionKey<PanelInstanceContext> = Symbol('panel-instance')

export function usePanelInstance(): PanelInstanceContext | undefined {
  return inject(PanelInstanceKey, undefined)
}
