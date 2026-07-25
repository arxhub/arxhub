import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Page } from '@playwright/test'
import { test as base, expect } from '@playwright/test'

// Matches LocalStorageKeyStore's namespace and the identity entry name.
const KEYSTORE_PREFIX = 'arxhub.keystore.'
const IDENTITY_KEY = `${KEYSTORE_PREFIX}identity.mnemonic`

// Every browser context starts with empty storage, so each test would otherwise boot a fresh
// identity — and the stand pins the first key that reaches it, leaving every later test rejected.
// Seeding one fixed mnemonic keeps all tests speaking as the same paired device.
export const SEEDED_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

// A second valid BIP39 phrase, for exercising identity replacement.
export const OTHER_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

// Reads and writes the same files the stand serves. Going through the filesystem rather than the
// HTTP API keeps setup free of request signing, and matches what markdown-first storage claims:
// the file on disk is the note.
export interface Vault {
  write(relative: string, content: string): Promise<string>
  read(relative: string): Promise<string>
}

function vaultRoot(): string {
  const dir = process.env.ARXHUB_E2E_DATA_DIR
  if (!dir) throw new Error('ARXHUB_E2E_DATA_DIR is unset — playwright.config.ts should have exported it')
  return join(dir, 'vault')
}

export const test = base.extend<{ app: Page; vault: Vault }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature requires the deps arg
  vault: async ({}, use, testInfo) => {
    // Unique filename per test rather than a subdirectory: parallel workers stay isolated and the
    // note still sits at the tree root, where it is visible without expanding anything.
    const prefix = testInfo.title
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()
      .slice(0, 40)
    const vault: Vault = {
      async write(relative, content) {
        const path = `${prefix}--${relative}`
        const full = join(vaultRoot(), path)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, content)
        return path
      },
      async read(relative) {
        return readFileSync(join(vaultRoot(), relative), 'utf8')
      },
    }
    await use(vault)
  },

  app: async ({ page }, use) => {
    // Seed only when absent: this runs on every navigation, so setting it unconditionally would
    // overwrite an identity the app itself wrote and silently undo a reload-based change.
    await page.addInitScript(
      ([key, mnemonic]) => {
        if (window.localStorage.getItem(key) == null) window.localStorage.setItem(key, mnemonic)
      },
      [IDENTITY_KEY, SEEDED_MNEMONIC] as const,
    )
    await page.goto('/')
    // The mobile frame keeps the mini-app list behind the menu, so wait on something both frames show.
    await expect(page.getByRole('main')).toBeVisible()
    await use(page)
  },
})

// The tree is read at boot, so a note written after the app came up needs a reload to appear.
export async function openNote(page: Page, path: string): Promise<void> {
  await page.reload()
  await openNavigation(page)
  await page.getByRole('treeitem', { name: path }).click()
  await expect(page.locator('.cm-content')).toBeVisible()
}

// True while the viewport is narrow enough for the mobile frame — mirrors MOBILE_BREAKPOINT.
export function isMobileViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) <= 640
}

// On the mobile frame the mini-app list and each mini-app's own navigation live behind the menu.
export async function openNavigation(page: Page): Promise<void> {
  if (!isMobileViewport(page)) return
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeVisible()
}

export async function openSettingsSection(page: Page, section: string): Promise<void> {
  await openNavigation(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  // Picking a mini-app is itself a navigation step on the mobile frame, so the drawer closes and the
  // app's own section list has to be reopened. On desktop the rail is always there.
  await openNavigation(page)
  await page.getByRole('button', { name: section, exact: true }).click()
}

export async function openSecuritySettings(page: Page): Promise<void> {
  await openSettingsSection(page, 'Security')
  await expect(page.getByRole('heading', { name: 'Device identity' })).toBeVisible()
}

export function storedMnemonic(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), IDENTITY_KEY)
}

export { expect }
