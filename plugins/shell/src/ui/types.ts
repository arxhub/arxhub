import type { Component } from 'vue'

// What a mini-app registers with the shell. Read as a type with no objects by `use-navigation.ts`, which
// is the whole of it now: both frames draw the type row from `ShellExtension.types`, and this bridge
// empties itself as each remaining plugin registers a type of its own (F-23…F-25).
export interface SidebarItem {
  id: string
  // Icon spec string resolved by uikit's Icon registry (e.g. `lu:folder-open`, or an emoji).
  icon: string
  title: string
  layout?: Component
  region?: 'top' | 'bottom'
  order?: number
  // When true the item renders NO rail icon, but its `layout` still shows as content when made active
  // (e.g. via shell.sidebar.setActive from a status item). Use for mini-apps opened from the bar.
  hidden?: boolean
  // Names another sidebar item's id whose mobile rail this one has contributed a section to instead of
  // getting its own bottom-bar destination — the mobile frame drops it from the tab row on that account.
  // Declarative, so the shell filters generically without importing or naming either plugin; the
  // absorbing mini-app never has to know this field exists. Desktop is unaffected: the rail column
  // still shows every item regardless of this field.
  absorbedOnMobileBy?: string
}
