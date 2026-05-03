import type { Component } from 'vue'

export interface SidebarItem {
  id: string
  icon: Component
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
