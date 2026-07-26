// The desktop frame. An instance imports exactly one frame entry, which is what keeps the other one's
// components — and their weight — out of the bundle entirely.
export { default as AppFooter } from './ui/desktop/AppFooter.vue'
export { default as AppHeader } from './ui/desktop/AppHeader.vue'
export { default as AppSidebar } from './ui/desktop/AppSidebar.vue'
export { default as DesktopLayout } from './ui/desktop/DesktopLayout.vue'
export { default as DesktopShell } from './ui/desktop/DesktopShell.vue'
export type { AppSidebarProps } from './ui/desktop/types'
