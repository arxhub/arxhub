import { Extension, type ExtensionArgs } from '@arxhub/core'
import { shallowRef } from 'vue'

// A theme is a whole unit, the way an editor's colour theme is — not a brightness switch. Its CSS
// ships already loaded and scoped to `[data-arxhub-theme='<id>']`; selecting one flips the attribute.
export interface Theme {
  id: string
  title: string
  // Whether the theme paints on a dark or a light base. Not a mode the user picks: it is a property
  // of the theme, and it tells the shared colour scales (danger, warning) which variant to use.
  base: 'light' | 'dark'
}

export const THEME_ATTRIBUTE = 'data-arxhub-theme'

// Read before the first paint by the theme-boot script (@arxhub/toolchain-vite themeBoot) — the device's
// last applied theme, so a boot or crash screen already wears it. Device-local on purpose: the chosen
// theme lives in config, which is not readable that early.
export const THEME_STORAGE_KEY = 'arxhub.theme'

export class ThemeExtension extends Extension {
  readonly themes = shallowRef<Theme[]>([])
  readonly activeId = shallowRef<string | null>(null)

  constructor(args: ExtensionArgs) {
    super(args)
  }

  register(...themes: Theme[]): void {
    const known = new Set(this.themes.value.map((t) => t.id))
    const added = themes.filter((t) => !known.has(t.id))
    if (added.length > 0) this.themes.value = [...this.themes.value, ...added]
  }

  apply(id: string): void {
    const theme = this.themes.value.find((t) => t.id === id)
    if (theme == null) {
      this.logger.warn(`apply(${id}) ignored: no such theme`)
      return
    }
    this.activeId.value = theme.id
    const root = document.documentElement
    root.setAttribute(THEME_ATTRIBUTE, theme.id)
    // The shared scales (danger, warning) carry their own dark variants keyed on this attribute, so
    // a dark theme has to announce its base or those colours stay light against it.
    root.setAttribute('data-theme', theme.base)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ id: theme.id, base: theme.base }))
    } catch {
      // Private mode or blocked storage: the next boot falls back to the system preference.
    }
  }
}
