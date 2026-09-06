import { useArxHub } from '@arxhub/uikit/hooks'
import { type ComputedRef, computed } from 'vue'
import { type FooterItem, type MobileTab, ShellExtension } from './extension'
import type { SidebarItem } from './types'

// Both frames read the same registries — what differs is where the items land, not what they are.
// Keeping the derivation here means a plugin's contribution reaches the mobile frame the moment it
// reaches the desktop one, with no second wiring to forget.
export interface Shell {
  readonly activeItem: ComputedRef<SidebarItem | undefined>
  readonly activeTitle: ComputedRef<string>
  readonly sidebarItems: ComputedRef<SidebarItem[]>
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

  // Nothing has claimed the first screen when every mini-app that would have is switched off — which is
  // exactly a maintenance boot, where `sidebar.register` never auto-activates because the only item left
  // (Settings) sits in the 'bottom' region. The desktop frame then renders no mini-app at all, and since
  // the status bar lives inside the mini-app shell (see DesktopMiniAppShell) the window came up empty:
  // no content, and no pill saying maintenance mode is on — on the one boot that exists to say so.
  // Resolved here rather than at registration time, so it does not depend on which plugin configures
  // first.
  const activeItem = computed(
    () => shell.sidebar.items.find((i) => i.id === shell.sidebar.activeId) ?? byOrder(shell.sidebar.items.filter((i) => !i.hidden))[0],
  )

  return {
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
        absorbedOnMobileBy: item.absorbedOnMobileBy,
        mobileTitle: item.mobileTitle,
      })),
    ),
    footerLeft: computed(() => byOrder(shell.footer.items.filter((i) => i.region === 'left'))),
    footerRight: computed(() => byOrder(shell.footer.items.filter((i) => i.region === 'right'))),
    tabs: computed(() => byOrder(shell.tabs.items)),
    setActive: (id: string) => shell.sidebar.setActive(id),
    // The resolved item's id, not the raw registry value: with the fallback above, the rail and the
    // bottom bar have to mark the mini-app that is actually on screen as the one you are in.
    activeId: computed(() => activeItem.value?.id ?? ''),
  }
}
