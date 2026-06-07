import type { Component } from 'vue'

export interface SidebarItem {
  id: string
  // Icon spec string resolved by uikit's Icon registry (e.g. `lu:folder-open`, or an emoji).
  icon: string
  title: string
  layout?: Component
  region?: 'top' | 'bottom'
  order?: number
}

export interface AppSidebarProps {
  content?: Component
  items?: SidebarItem[]
  activeId?: string
}
