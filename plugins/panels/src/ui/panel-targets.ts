import type { InjectionKey } from 'vue'

// Views belong to the desk, not to the recursive split tree. Moving a tab changes its DOM target
// while the editor instance (buffer, undo, selection) stays mounted.
export const PanelTargetsKey: InjectionKey<Map<string, HTMLElement>> = Symbol('panel-targets')
