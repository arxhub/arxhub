import type { Component } from 'vue'

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

export interface AppSidebarProps {
  content?: Component
  items?: SidebarItem[]
  activeId?: string
}
