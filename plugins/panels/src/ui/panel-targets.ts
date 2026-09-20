import type { PanelChromeState } from '@arxhub/uikit/hooks'
import type { InjectionKey, ShallowRef } from 'vue'

// Views belong to the desk, not to the recursive split tree. Moving a tab changes its DOM target
// while the editor instance (buffer, undo, selection) stays mounted.
export const PanelTargetsKey: InjectionKey<Map<string, HTMLElement>> = Symbol('panel-targets')

export interface PanelChromeRegistry {
  actions: Map<string, HTMLElement>
  states: Map<string, ShallowRef<PanelChromeState>>
}
export const PanelChromeRegistryKey: InjectionKey<PanelChromeRegistry> = Symbol('panel-chrome-registry')
