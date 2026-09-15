import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { test as base, expect } from '@playwright/test'

// Matches LocalStorageKeyStore's namespace and the identity entry name.
const KEYSTORE_PREFIX = 'arxhub.keystore.'
export const IDENTITY_KEY = `${KEYSTORE_PREFIX}identity.mnemonic`

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
  write(relative: string, content: string | Uint8Array): Promise<string>
  read(relative: string): Promise<string>
  remove(relative: string): Promise<void>
  // Anything outside vault/ — plugin storage, local state. Relative to the data root.
  readData(relative: string): Promise<string>
  writeData(relative: string, content: string): Promise<void>
}

// Each project drives its own stand and its own data dir (playwright.config.ts), keyed by project name
// because a worker process serves exactly one project — never a single shared `ARXHUB_E2E_DATA_DIR`,
// which is what let the two projects' repo stores race each other.
function dataRoot(testInfo: TestInfo): string {
  const envKey = `ARXHUB_E2E_DATA_DIR_${testInfo.project.name.toUpperCase()}`
  const dir = process.env[envKey]
  if (!dir) throw new Error(`${envKey} is unset — playwright.config.ts should have exported it`)
  return dir
}

function vaultRoot(testInfo: TestInfo): string {
  return join(dataRoot(testInfo), 'vault')
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
        const full = join(vaultRoot(testInfo), path)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, content)
        return path
      },
      async read(relative) {
        return readFileSync(join(vaultRoot(testInfo), relative), 'utf8')
      },
      async readData(relative) {
        return readFileSync(join(dataRoot(testInfo), relative), 'utf8')
      },
      async writeData(relative, content) {
        const full = join(dataRoot(testInfo), relative)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, content)
      },
      async remove(relative) {
        rmSync(join(vaultRoot(testInfo), relative), { force: true })
      },
    }
    await use(vault)
  },

  app: async ({ page }, use, testInfo) => {
    // Every console line and every failed request of this page, kept for the one case that needs them:
    // a test that ends with no app on screen. The page is gone by the time the report is read, so a
    // failure that leaves nothing behind is a failure nobody can diagnose from the report.
    recordPageChatter(page)
    // Seed only when absent: this runs on every navigation, so setting it unconditionally would
    // overwrite an identity the app itself wrote and silently undo a reload-based change.
    await page.addInitScript(
      ([key, mnemonic]) => {
        if (window.localStorage.getItem(key) == null) window.localStorage.setItem(key, mnemonic)
      },
      [IDENTITY_KEY, SEEDED_MNEMONIC] as const,
    )
    try {
      await page.goto('/')
      // `<main>` is the app's own landmark and both frames render one — so this waits for the app rather
      // than for anything either frame happens to draw.
      await waitForApp(page)
      await use(page)
    } finally {
      // In a finally, because the boot failing right here is the case the record was kept for.
      await attachPageChatter(page, testInfo)
    }
  },
})

// ---------------------------------------------------------------------------------------------
// Is the app there, and if not, why not
// ---------------------------------------------------------------------------------------------

interface PageChatter {
  console: string[]
  errors: string[]
  failedRequests: string[]
  // When the main frame last committed a document. A page that navigated a moment ago is a page whose
  // app is booting again — and a navigation nothing in the test asked for is the dev server reloading
  // it, which looks exactly like "the app never came up" from the outside.
  navigatedAt: number
  navigations: number
}

const chatter = new WeakMap<Page, PageChatter>()

function recordPageChatter(page: Page): void {
  const log: PageChatter = { console: [], errors: [], failedRequests: [], navigatedAt: Date.now(), navigations: 0 }
  chatter.set(page, log)
  page.on('console', (message) => log.console.push(`[${message.type()}] ${message.text()}`))
  page.on('pageerror', (error) => log.errors.push(String(error.stack ?? error)))
  page.on('requestfailed', (request) => log.failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`))
  // A navigation clears the record: what matters is the boot that is on screen now, and a test that
  // reloads five times would otherwise bury it under four boots that went fine.
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return
    log.navigatedAt = Date.now()
    log.navigations += 1
    log.console.length = 0
    log.errors.length = 0
    log.failedRequests.length = 0
  })
}

async function attachPageChatter(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return
  const log = chatter.get(page)
  if (log == null) return
  const body = [
    `# console (since the last navigation)\n${log.console.join('\n') || '(nothing)'}`,
    `# page errors\n${log.errors.join('\n\n') || '(none)'}`,
    `# failed requests\n${log.failedRequests.join('\n') || '(none)'}`,
  ].join('\n\n')
  await testInfo.attach('page-chatter.txt', { body, contentType: 'text/plain' })
}

// Waits for the app itself, and says which of the four things happened when it is not there.
//
// `<main>` is the app's own landmark and neither pre-boot screen renders one, deliberately — so "no
// main" alone covers a boot still running, a boot that died onto the crash screen, and a mount that
// never happened, which need three different fixes. This tells them apart and fails with the one that
// is true. Nothing here waits longer than the plain assertion did.
export async function waitForApp(page: Page): Promise<void> {
  try {
    await expect(page.getByRole('main')).toBeVisible()
  } catch (error) {
    throw new Error(`no app on screen: ${await whyNoApp(page)}`, { cause: error })
  }
}

async function whyNoApp(page: Page): Promise<string> {
  const crash = page.locator('.crash')
  if (await crash.isVisible().catch(() => false)) {
    return `the boot failed and handed the page to the crash screen — ${await terse(crash)}`
  }
  const boot = page.locator('.boot')
  if (await boot.isVisible().catch(() => false)) {
    return `the boot is still running — ${await terse(boot)}`
  }
  const log = chatter.get(page)
  const said = [
    log?.errors.length ? `page errors: ${log.errors.join(' | ')}` : '',
    log?.failedRequests.length ? `failed requests: ${log.failedRequests.join(' | ')}` : '',
    log?.console.filter((it) => it.startsWith('[error]')).join(' | '),
  ]
    .filter(Boolean)
    .join('; ')
  const root =
    (await page
      .locator('#app')
      .innerHTML()
      .catch(() => '')) ?? ''
  const mounted = root.trim().length > 0 ? 'something is mounted at #app but renders no <main>' : '#app is empty — the mount never happened'
  const state = await page.evaluate(() => document.readyState).catch(() => 'unknown')
  const since = log == null ? '' : `, ${log.navigations} navigation(s), the last ${Date.now() - log.navigatedAt} ms ago`
  return `neither boot screen is up, document.readyState=${state}${since}, and ${mounted}${said ? ` (${said})` : ' and the page said nothing'}`
}

async function terse(locator: Locator): Promise<string> {
  const text = ((await locator.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 600 ? `${text.slice(0, 600)}…` : text
}

// The tree is read at boot, so a note written after the app came up needs a reload to appear.
export async function openNote(page: Page, path: string): Promise<void> {
  await openFile(page, path)
  await expect(page.locator('.cm-content')).toBeVisible()
}

// Open an object from the tree without assuming what opens it — an image, a recording, a file nothing
// claims. openNote is this plus the wait for an editor.
export async function openFile(page: Page, path: string): Promise<void> {
  await page.reload()
  await openNavigation(page)
  await page.getByRole('treeitem', { name: path }).click()
}

// Which frame the bundle under test mounted. The stand probes the viewport and the pointer once at
// boot (detectShellFrame), so the two Playwright projects each get exactly one frame and it never
// changes mid-test — this asks the page which one it got rather than re-deriving the rule.
export async function isMobileFrame(page: Page): Promise<boolean> {
  // The app mounts asynchronously — the identity is resolved, then the frame itself is imported — so
  // reading the DOM straight after a reload would race the mount and report the wrong frame. Both
  // frames render a <main>, so that is the signal that there is a frame to ask about at all.
  await waitForApp(page)
  return (await page.locator('.mobile-shell').count()) > 0
}

// A type's own navigation. On the mobile frame it is a panel summoned from the bottom row, not a column
// that is always there; on the desktop it is the column beside the content and there is nothing to
// summon. Reached by test id because the key is named by whichever type owns the navigation — "Vault"
// under Notes, "Sections" under Settings — so there is no one label to click.
export async function openNavigation(page: Page): Promise<void> {
  if (!(await isMobileFrame(page))) return
  const panel = page.getByRole('region', { name: /navigation$/ })
  // Idempotent: some flows leave the panel open, and the key would close it again.
  if (!(await panel.isVisible())) await page.getByTestId('arxhub.shell.rail').click()
  await expect(panel).toBeVisible()
}

// The status widgets: a permanent bar on the desktop frame, one level down inside the search sheet on a
// phone — everything not needed while reading is behind the row's own immobile key, which is the whole
// point of the row. Hands the scope they are in to `read`, so a test looks in the right place without
// knowing which frame it got, and leaves the frame as it found it: a sheet left open would swallow the
// next click.
export async function withShellChrome<T>(page: Page, read: (chrome: Locator) => Promise<T>): Promise<T> {
  if (!(await isMobileFrame(page))) return read(page.locator('body'))

  const sheet = searchSheet(page)
  const wasOpen = await sheet.isVisible()
  if (!wasOpen) await page.getByRole('button', { name: SHEET_LABEL }).click()
  await expect(sheet).toBeVisible()
  try {
    return await read(sheet)
  } finally {
    // Back, not the key again: the sheet covers the row it opened from. And only while it is still
    // up — choosing something in the sheet is a navigation step and puts it away by itself, and a
    // goBack() then walks the page out of the app rather than closing anything.
    if (!wasOpen && (await sheet.isVisible())) {
      await page.goBack()
      await expect(sheet).toBeHidden()
    }
  }
}

// The one sheet both frames open on ⌘K — a dialog on the desktop, a bottom sheet on the phone — holding
// everything that is open and everything that can be opened, plus (on the phone only) the status block
// the desktop keeps permanently in its bar.
export const SHEET_LABEL = 'Open or switch to'

export function searchSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: SHEET_LABEL })
}

// The row of types: down the left of the desktop window, along the bottom of a phone. One nav landmark
// in both frames, because it is one level of one model — which is what the type row replaced two
// registries and two components with.
export function typeRow(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Types' })
}

// A type's key in the row. Its accessible name carries the count when it has one ("Notes, 3 open"), so
// this matches the title at the start rather than whole.
export function typeKey(page: Page, title: string): Locator {
  return typeRow(page).getByRole('button', { name: new RegExp(`^${title}(,|$)`) })
}

// Go to a type — and only when it is not already where you are. A second tap on your own type is the
// SECOND level on the mobile frame (the list of what is open), so "go here" applied to where you
// already are would open a layer over it rather than doing nothing.
//
// An UNPINNED type (Search, the log viewer) holds no key in the row until it is open, so reaching it
// goes through the sheet's "Open new" section — the one path the model gives it. Pass the type's id to
// say that is what this is: without a key in the row there is nothing to click, and nothing to name it
// by either, since the sheet lists the same title in both of its sections.
export async function openType(page: Page, title: string, typeId?: string): Promise<void> {
  const key = typeKey(page, title)
  // A pinned type needs no boot wait of its own: getAttribute below waits for its key to exist. An
  // unpinned one has no key to wait for — "not in the row" and "the app is not up yet" look identical
  // from here — so the app is what has to be there before the sheet can be asked for it.
  if (typeId != null) {
    await waitForApp(page)
    if ((await key.count()) === 0) {
      await page.keyboard.press('ControlOrMeta+k')
      await searchSheet(page).getByTestId(`sheet:new:${typeId}`).click()
      await expect(searchSheet(page)).toBeHidden()
      await expect(key).toHaveAttribute('aria-pressed', 'true')
      return
    }
  }
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click()
  await expect(key).toHaveAttribute('aria-pressed', 'true')
}

// The index is brought up detached from the boot — status 'opening', then a walk of the whole vault — so the
// first moment of a session has an index that answers over part of the store and a Reindex control that is
// inert while the walk runs (AGENTS.md, "start() must not hold the first paint"). This waits for the status
// line the Search rail already renders to say the walk is done: "N in index". Read from the rail, so it is
// called while that rail is on screen — on a phone the console closes the panel it was opened from.
export async function waitForIndex(page: Page): Promise<void> {
  // Longer than the default expect timeout, shorter than the test's own: a cold PGlite boots a WASM payload
  // and then walks the vault, and eight workers do that at once.
  await expect(page.locator('.index-state-text')).toContainText(/\d+ in index/, { timeout: 20_000 })
}

// Search is a type of its own in both frames now, and an unpinned one: it is reached through the sheet
// rather than from a permanent key, in both frames alike. It used to be a mini-app on the desktop and a
// section of Explorer's mobile rail, which is exactly the divergence the type row exists to make
// unrepresentable. Shared, because both the search and the SQL-console specs start from this screen.
export async function openSearchApp(page: Page): Promise<void> {
  await openType(page, 'Search', 'arxhub.search')
  await expect(page.getByRole('textbox', { name: 'Search' }).first()).toBeVisible()
  // Every screen reached from here reads the index: the result list, the console's queries, the Reindex
  // control. Waiting for the walk once, here, is what keeps each of them from racing it.
  await waitForIndex(page)
}

// The list of what is open inside the active type — the second level. On a phone it is a second tap on
// the type you are already in; on the desktop both levels are on screen at once and the tab strip is
// that list, so this is mobile-only the way the tab strip is desktop-only.
export async function openDocumentList(page: Page): Promise<Locator> {
  await openType(page, 'Notes')
  // The second tap, which is what opens it.
  await typeKey(page, 'Notes').click()
  const list = page.getByRole('menu', { name: 'Open documents' })
  await expect(list).toBeVisible()
  return list
}

export async function openSettingsSection(page: Page, section: string): Promise<void> {
  await openType(page, 'Settings')
  // The section list is the mini-app's own rail, which on the mobile frame has to be summoned. On
  // desktop it is already beside the content.
  await openNavigation(page)
  // Scoped to the section list: a section shares its name with the type of the same plugin (Search's
  // settings section and the Search type are both called "Search"), and an unscoped lookup would match
  // that type's key in the row as well once it is open.
  await page.locator('.settings-nav').getByRole('button', { name: section, exact: true }).click()
}

export async function openSecuritySettings(page: Page): Promise<void> {
  await openSettingsSection(page, 'Security')
  await expect(page.getByRole('heading', { name: 'Device identity' })).toBeVisible()
}

export function storedMnemonic(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), IDENTITY_KEY)
}

export { expect }
