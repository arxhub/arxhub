import { useArxHub } from '@arxhub/uikit/hooks'
import { type Component, type ComputedRef, computed } from 'vue'
import { type FooterItem, type HeaderItem, type MobileTab, ShellExtension } from './extension'
import type { SidebarItem } from './types'

// Both frames read the same registries — what differs is where the items land, not what they are.
// Keeping the derivation here means a plugin's contribution reaches the mobile frame the moment it
// reaches the desktop one, with no second wiring to forget.
export interface Shell {
  readonly content: ComputedRef<Component | undefined>
  readonly activeItem: ComputedRef<SidebarItem | undefined>
  readonly activeTitle: ComputedRef<string>
  readonly sidebarItems: ComputedRef<SidebarItem[]>
  readonly headerLeft: ComputedRef<HeaderItem[]>
  readonly headerCenter: ComputedRef<HeaderItem[]>
  readonly headerRight: ComputedRef<HeaderItem[]>
  readonly footerLeft: ComputedRef<FooterItem[]>
  readonly footerRight: ComputedRef<FooterItem[]>
  readonly tabs: ComputedRef<MobileTab[]>
  setActive(id: string): void
  readonly activeId: ComputedRef<string>
}

function byOrder<T extends { order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function useShell(): Shell {
  const arxhub = useArxHub()
  const shell = arxhub.extensions.get(ShellExtension)

  const activeItem = computed(() => shell.sidebar.items.find((i) => i.id === shell.sidebar.activeId))

  return {
    content: computed(() => shell.content.value ?? undefined),
    activeItem,
    activeTitle: computed(() => activeItem.value?.title ?? 'ArxHub'),
    sidebarItems: computed(() =>
      shell.sidebar.items.map((item) => ({
        id: item.id,
        icon: item.icon,
        title: item.title,
        region: item.region,
        order: item.order,
        hidden: item.hidden,
      })),
    ),
    headerLeft: computed(() => byOrder(shell.header.items.filter((i) => i.region === 'left'))),
    headerCenter: computed(() => byOrder(shell.header.items.filter((i) => i.region === 'center'))),
    headerRight: computed(() => byOrder(shell.header.items.filter((i) => i.region === 'right'))),
    footerLeft: computed(() => byOrder(shell.footer.items.filter((i) => i.region === 'left'))),
    footerRight: computed(() => byOrder(shell.footer.items.filter((i) => i.region === 'right'))),
    tabs: computed(() => byOrder(shell.tabs.items)),
    setActive: (id: string) => shell.sidebar.setActive(id),
    activeId: computed(() => shell.sidebar.activeId),
  }
}
