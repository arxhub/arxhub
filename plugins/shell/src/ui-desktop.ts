// The desktop frame. An instance imports exactly one frame entry, which is what keeps the other one's
// components — and their weight — out of the bundle entirely.
export { default as DesktopShell } from './ui/desktop/DesktopShell.vue'
export { NAV_DEFAULT, NAV_MAX, NAV_MIN, navColumn } from './ui/desktop/use-nav-column'
