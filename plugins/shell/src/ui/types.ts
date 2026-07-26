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
}
