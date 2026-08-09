import type { Component } from 'vue'

// What a mini-app registers with the shell. Frame-agnostic on purpose: the desktop rail renders these
// as a column of icons and the mobile More sheet as a list of rows, from the same registration.
export interface SidebarItem {
  id: string
  // Icon spec string resolved by uikit's Icon registry (e.g. `lu:folder-open`, or an emoji).
  icon: string
  title: string
  layout?: Component
  region?: 'top' | 'bottom'
  order?: number
  // When true the item renders NO rail icon, but its `layout` still shows as content when made active
  // (e.g. via shell.sidebar.setActive from a footer button). Use for footer-triggered mini-apps.
  hidden?: boolean
  // Names another sidebar item's id whose mobile rail this one has contributed a section to instead of
  // getting its own bottom-bar destination — the mobile frame drops it from the tab row on that account.
  // Declarative, so the shell filters generically without importing or naming either plugin; the
  // absorbing mini-app never has to know this field exists. Desktop is unaffected: the rail column
  // still shows every item regardless of this field.
  absorbedOnMobileBy?: string
  // Overrides `title` for the mobile tab bar and More sheet only. A mini-app whose mobile rail now
  // absorbs another's job (Explorer's rail gained a Search section) may want a name that covers both —
  // "Explorer" undersells it, but the desktop rail icon keeps its own name unrelated to what mobile did.
  mobileTitle?: string
}
