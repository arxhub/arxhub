import { Extension } from '@arxhub/core'
import { type Component, markRaw, reactive, shallowRef } from 'vue'
import type { SidebarItem } from './types'

export type { SidebarItem }

export interface ShellItem {
  id: string
  component: Component
  region: string
  order?: number
}

export type HeaderItem = ShellItem & { region: 'left' | 'center' | 'right' }
export type FooterItem = ShellItem & { region: 'left' | 'right' }

// A key in the mobile frame's bottom bar. The bar is the only navigation a phone gets, so a plugin
// that owns something reachable there contributes a tab instead of a strip widget — the desktop frame
// ignores these entirely.
export interface MobileTab {
  id: string
  // Icon spec string resolved by uikit's Icon registry.
  icon: string
  title: string
  order?: number
  // Read on every render: a count the tab carries (open documents, unread logs). 0 shows no badge.
  badge?: () => number
  // Selecting a tab is an action, not a route — it may activate a mini-app, raise a sheet, or open a
  // panel. The frame only asks whether the tab reads as active, which is the tab's own business.
  active?: () => boolean
  onSelect: () => void
  // What being active MEANS for this key, which decides how the bar states it.
  //
  // A 'place' is where you are — one of the mini-apps — and exactly one is ever active, so it takes
  // the accent, the same as a selected row or tab anywhere else in the app.
  //
  // A 'layer' is something open on top of where you are: the navigation panel, the More sheet. It can
  // be active at the same time as a place, and when both wore the accent the bar showed two selected
  // keys and answered neither "where am I" nor "what is open". A layer states itself with a raised
  // fill instead.
  role?: 'place' | 'layer'
  // Binds a screen-edge drag to this tab, so the two layers reachable one-handed do not cost a trip
  // to the bar. At most one tab per edge; a later claim on a taken edge is ignored.
  gesture?: 'left-edge' | 'right-edge'
}

export class ShellExtension extends Extension {
  readonly content = shallowRef<Component | null>(null)

  readonly sidebar = reactive({
    items: [] as SidebarItem[],
    activeId: '',
    register(item: SidebarItem): void {
      this.items = [...this.items, { ...item, layout: item.layout ? markRaw(item.layout) : undefined }]
      if (!this.activeId && item.region !== 'bottom') {
        this.activeId = item.id
      }
    },
    unregister(id: string): void {
      this.items = this.items.filter((i) => i.id !== id)
    },
    setActive(id: string): void {
      this.activeId = id
    },
  })

  readonly header = reactive({
    items: [] as HeaderItem[],
    register(item: HeaderItem): void {
      // markRaw the component (like sidebar does with layout) so Vue doesn't deeply track the
      // component definition as reactive state — that's wasteful and can break some components.
      this.items = [...this.items, { ...item, component: markRaw(item.component) }]
    },
    unregister(id: string): void {
      this.items = this.items.filter((i) => i.id !== id)
    },
  })

  readonly footer = reactive({
    items: [] as FooterItem[],
    register(item: FooterItem): void {
      this.items = [...this.items, { ...item, component: markRaw(item.component) }]
    },
    unregister(id: string): void {
      this.items = this.items.filter((i) => i.id !== id)
    },
  })

  readonly tabs = reactive({
    items: [] as MobileTab[],
    register(tab: MobileTab): void {
      this.items = [...this.items, tab]
    },
    unregister(id: string): void {
      this.items = this.items.filter((t) => t.id !== id)
    },
  })

  setContent(component: Component): void {
    this.content.value = component
  }
}
