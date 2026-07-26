import type { Component } from 'vue'
import type { SidebarItem } from '../types'

export interface AppSidebarProps {
  content?: Component
  items?: SidebarItem[]
  activeId?: string
}
