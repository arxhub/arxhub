import { type InjectionKey, inject, provide } from 'vue'

// A type's navigation draws its own head. The vault tree's strip carries the title and the tree's own
// actions — new file, refresh, collapse the tree — and only the tree knows what belongs there. A frame
// drawing a second strip above it is the DS-1 defect in the flesh: two bands, two titles, 80px of
// chrome for one role.
//
// So a frame contributes ONE control into that strip instead of drawing a strip of its own, and this is
// where it says what that control does. The same control means different things in the two frames, and
// that is the point: on the desktop the navigation is a column and the control collapses it; on the
// phone it is a panel over the content and the control puts it away. The navigation component neither
// knows nor asks which frame it is in — it renders the icon and the label it is handed.
//
// Absent is a legal state: a navigation shown anywhere else (inside a page, in a test bench) has
// nothing to dismiss, which is why the default is `null` rather than a stub that throws.
export interface NavHost {
  readonly dismiss: () => void
  readonly navigated?: () => void
  // Icon spec string resolved by uikit's Icon registry.
  readonly icon: string
  readonly label: string
}

export const NavHostKey: InjectionKey<NavHost> = Symbol('arxhub.nav-host')

export function provideNavHost(host: NavHost): void {
  provide(NavHostKey, host)
}

export function useNavHost(): NavHost | null {
  return inject(NavHostKey, null)
}
