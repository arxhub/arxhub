import type { Page } from '@playwright/test'
import { expect } from './fixtures'

// The theme-boot script (@arxhub/toolchain-vite themeBoot) runs from <head>, before any module. Holding
// the app's own entry back leaves exactly the document the first paint is made of — whatever wears a
// theme there was put on by that script and by nothing the app did later.
export const APP_ENTRY = '**/src/main.ts'
export const STORAGE_KEY = 'arxhub.theme'
export const THEME_CONFIG = 'storage/theme/config.toml'

export interface Attributes {
  theme: string | null
  base: string | null
}

export function attributes(page: Page): Promise<Attributes> {
  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-arxhub-theme'),
    base: document.documentElement.getAttribute('data-theme'),
  }))
}

export interface FirstPaint extends Attributes {
  // What the canvas is painted as. No stylesheet has loaded yet, so only the script's <meta> can say dark.
  scheme: string
}

export async function firstPaint(page: Page): Promise<FirstPaint> {
  await page.route(APP_ENTRY, (route) => route.abort())
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Proves the app really was held back, so nothing below can be the theme plugin's doing.
    await expect(page.getByRole('main')).toHaveCount(0)
    // The <meta> sets the page's USED scheme and leaves the computed `color-scheme` at `normal`, so the
    // canvas is read through the system colour it paints: `Canvas` is near-black only on a dark scheme.
    const scheme = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'Canvas'
      document.documentElement.appendChild(probe)
      const [r, g, b] = (getComputedStyle(probe).backgroundColor.match(/\d+/g) ?? []).map(Number)
      probe.remove()
      return r + g + b < 384 ? 'dark' : 'light'
    })
    return { ...(await attributes(page)), scheme }
  } finally {
    await page.unroute(APP_ENTRY)
  }
}

export async function seedSavedTheme(page: Page, saved: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) == null) window.localStorage.setItem(key, value)
    },
    [STORAGE_KEY, saved] as const,
  )
}
