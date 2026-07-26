import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
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
  remove(relative: string): Promise<void>
  // Anything outside vault/ — plugin storage, local state. Relative to the data root.
  readData(relative: string): Promise<string>
  writeData(relative: string, content: string): Promise<void>
}

function dataRoot(): string {
  const dir = process.env.ARXHUB_E2E_DATA_DIR
  if (!dir) throw new Error('ARXHUB_E2E_DATA_DIR is unset — playwright.config.ts should have exported it')
  return dir
}

function vaultRoot(): string {
  return join(dataRoot(), 'vault')
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
      async readData(relative) {
        return readFileSync(join(dataRoot(), relative), 'utf8')
      },
      async writeData(relative, content) {
        const full = join(dataRoot(), relative)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, content)
      },
      async remove(relative) {
        rmSync(join(vaultRoot(), relative), { force: true })
        rmSync(join(vaultRoot(), `${relative}.arxmeta`), { force: true })
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

// Which frame the bundle under test mounted. The stand probes the viewport and the pointer once at
// boot (detectShellFrame), so the two Playwright projects each get exactly one frame and it never
// changes mid-test — this asks the page which one it got rather than re-deriving the rule.
export async function isMobileFrame(page: Page): Promise<boolean> {
  // The app mounts asynchronously — the identity is resolved, then the frame itself is imported — so
  // reading the DOM straight after a reload would race the mount and report the wrong frame. Both
  // frames render a <main>, so that is the signal that there is a frame to ask about at all.
  await expect(page.getByRole('main')).toBeVisible()
  return (await page.locator('.mobile-shell').count()) > 0
}

// On the mobile frame a mini-app's own navigation is a panel summoned from the bottom bar, not a
// column that is always there.
export async function openNavigation(page: Page): Promise<void> {
  if (!(await isMobileFrame(page))) return
  const panel = page.getByRole('region', { name: /navigation$/ })
  // Idempotent: some flows leave the panel open, and the key would close it again.
  if (!(await panel.isVisible())) await page.getByRole('button', { name: 'Files' }).click()
  await expect(panel).toBeVisible()
}

// The mini-app list and the status widgets: a permanent rail and strip on the desktop frame, both one
// level down in the More sheet on a phone — everything not needed while reading is behind one key,
// which is the whole point of the bar. Hands the scope they are in to `read`, so a test looks in the
// right place without knowing which frame it got, and leaves the frame as it found it: a sheet left
// open would swallow the next click.
export async function withShellChrome<T>(page: Page, read: (chrome: Locator) => Promise<T>): Promise<T> {
  if (!(await isMobileFrame(page))) return read(page.locator('body'))

  const sheet = page.getByRole('dialog', { name: 'More' })
  const wasOpen = await sheet.isVisible()
  if (!wasOpen) await page.getByRole('button', { name: 'More' }).click()
  await expect(sheet).toBeVisible()
  try {
    return await read(sheet)
  } finally {
    // Back, not the key again: the sheet covers the bar it opened from.
    if (!wasOpen) {
      await page.goBack()
      await expect(sheet).toBeHidden()
    }
  }
}

export async function openMiniApp(page: Page, name: string): Promise<void> {
  if (!(await isMobileFrame(page))) {
    await page.getByRole('button', { name, exact: true }).click()
    return
  }
  const sheet = page.getByRole('dialog', { name: 'More' })
  if (!(await sheet.isVisible())) await page.getByRole('button', { name: 'More' }).click()
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name, exact: true }).click()
  // Picking one is a navigation step, so the sheet that offered it gets out of the way.
  await expect(sheet).toBeHidden()
}

export async function openSettingsSection(page: Page, section: string): Promise<void> {
  await openMiniApp(page, 'Settings')
  // The section list is the mini-app's own rail, which on the mobile frame has to be summoned. On
  // desktop it is already beside the content.
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
