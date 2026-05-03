import { shallowRef, reactive, markRaw, type Component } from 'vue'
import { Extension } from '@arxhub/core'
import type { SidebarItem } from './desktop/types'

export type { SidebarItem }

export interface ShellItem {
  id: string
  component: Component
  region: string
  order?: number
}

export type HeaderItem = ShellItem & { region: 'left' | 'center' | 'right' }
export type FooterItem = ShellItem & { region: 'left' | 'right' }

export class ShellExtension extends Extension {
  readonly content = shallowRef<Component | null>(null)

  readonly sidebar = reactive({
    items: [] as SidebarItem[],
    activeId: '',
    register(item: SidebarItem): void {
      this.items = [...this.items, { ...item, icon: markRaw(item.icon), layout: item.layout ? markRaw(item.layout) : undefined }]
      if (!this.activeId && item.region !== 'bottom') {
        this.activeId = item.id
      }
    },
    unregister(id: string): void {
      this.items = this.items.filter(i => i.id !== id)
    },
    setActive(id: string): void {
      this.activeId = id
    },
  })

  readonly header = reactive({
    items: [] as HeaderItem[],
    register(item: HeaderItem): void {
      this.items = [...this.items, item]
    },
    unregister(id: string): void {
      this.items = this.items.filter(i => i.id !== id)
    },
  })

  readonly footer = reactive({
    items: [] as FooterItem[],
    register(item: FooterItem): void {
      this.items = [...this.items, item]
    },
    unregister(id: string): void {
      this.items = this.items.filter(i => i.id !== id)
    },
  })

  setContent(component: Component): void {
    this.content.value = component
  }
}
