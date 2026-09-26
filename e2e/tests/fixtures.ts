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
  removeData(relative: string): Promise<void>
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
      async removeData(relative) {
        rmSync(join(dataRoot(testInfo), relative), { force: true, recursive: true })
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

// The publishing tests of ONE project share one public store, one set of published roots and one config
// file on the stand. A republish from one page rebuilds the manifest for everyone, a roll back serves an
// older one, and a settings test clears the very address the others seeded — so two of them in flight at
// once each watch the other's note vanish. This hands the store to one test at a time, per project (each
// project has its own data dir, so the two frames never wait on each other). A mkdir is atomic on every
// filesystem, which is what makes it the lock; the dir is throwaway per run, so a stale one cannot outlive it.
export const publishTest = test.extend<{ publishStore: undefined }>({
  publishStore: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature requires the deps arg
    async ({}, use, testInfo) => {
      const lock = join(dataRoot(testInfo), 'publish.e2e-lock')
      const started = Date.now()
      const deadline = started + 180_000
      const budget = testInfo.timeout
      // Raised before the wait, not only after it: the test's own clock runs through fixture setup, so a queue
      // longer than the test's budget would time it out here, before the correction below ever ran.
      testInfo.setTimeout(budget + 180_000)
      for (;;) {
        try {
          mkdirSync(lock)
          break
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code !== 'EEXIST' || Date.now() > deadline) throw error
          await new Promise((resolve) => setTimeout(resolve, 250))
        }
      }
      // The wait is the queue's, not this test's: three files take the store in turn, and the last in line
      // would otherwise spend its whole budget in this fixture and time out before its first step.
      testInfo.setTimeout(budget + (Date.now() - started))
      try {
        await use(undefined)
      } finally {
        rmSync(lock, { recursive: true, force: true })
      }
    },
    { auto: true },
  ],
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
    // The element, not the role: a modal sheet over the app (the phone's vault, the second tap) takes the
    // rest of the page out of the accessibility tree, and the app is no less on screen for it.
    await expect(page.locator('main')).toBeVisible()
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
// The phone closes the open document from its object band: More, then Close. The band is the one road to
// the object's actions there, so a spec closing a document goes the way the owner does.
export async function closeFromBand(page: Page): Promise<void> {
  await page.getByTestId('object-bar').getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Close', exact: true }).click()
}

export async function isMobileFrame(page: Page): Promise<boolean> {
  // The app mounts asynchronously — the identity is resolved, then the frame itself is imported — so
  // reading the DOM straight after a reload would race the mount and report the wrong frame. Both
  // frames render a <main>, so that is the signal that there is a frame to ask about at all.
  await waitForApp(page)
  return (await page.locator('.mobile-shell').count()) > 0
}

// A type's own navigation. On the desktop it is the column beside the content and there is nothing to
// summon. On the phone it is one step down the second tap on the active type: a type without objects
// (Settings) shows it in that sheet directly, an object type (Documents) lists its tabs there and leads
// to the navigation from the row under them, which opens it over the whole screen.
export async function openNavigation(page: Page): Promise<void> {
  if (!(await isMobileFrame(page))) return
  const panel = navigationSheet(page)
  // Idempotent: some flows leave the navigation up, and a second tap would stack a sheet under it.
  if (await panel.isVisible()) return
  await activeTypeKey(page).click()
  const browse = page.getByTestId('type-sheet-browse')
  await expect(browse.or(panel)).toBeVisible()
  if (await browse.isVisible()) await browse.click()
  await expect(panel).toBeVisible()
}

// The phone's navigation, whichever sheet holds it — the vault over the whole screen, or Settings'
// sections in its second-tap sheet. What they share is the tree; the tab list has none.
// The vault is named as well, for the boot that has no tree to put in it (explorer switched off).
export function navigationSheet(page: Page): Locator {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tree') })
    .or(page.getByRole('dialog', { name: 'Vault', exact: true }))
}

// The key of the type you are in. A tap on it is the second tap: the type's own sheet.
export function activeTypeKey(page: Page): Locator {
  return typeRow(page).locator('[aria-pressed="true"]')
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
  if (!wasOpen) await moreKey(page).click()
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

// Settings is not pinned (OR-05), so it has no key in the row until it is open — every openType() for
// it has to name the type so the helper can reach it through the sheet instead.
export const SETTINGS_TYPE = 'arxhub.settings'

// What a surface that NAMES a file shows: a known extension is hidden there (plugins/documents/src/display-name.ts),
// and every spec below writes files whose extension the app claims. The whole name survives where it is an
// identity rather than a label — the file on disk, a tree row's aria-label — so locating a row still uses
// the path.
export function shownName(path: string): string {
  return path.replace(/\.[^./]+$/, '')
}

// The last key of the phone's type row. It opens "Open or switch to", and its name says how many types did
// not fit ("More, 2 not in the row"), so it is reached by id rather than by a name that changes.
export function moreKey(page: Page): Locator {
  return typeRow(page).getByTestId('arxhub.shell.search')
}

// What opens that sheet by a tap: the rail's own button on the desktop, More on the phone.
export async function switcherKey(page: Page): Promise<Locator> {
  return (await isMobileFrame(page)) ? moreKey(page) : page.getByRole('button', { name: SHEET_LABEL, exact: true })
}

export function searchSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: SHEET_LABEL })
}

// The row of types: down the left of the desktop window, along the bottom of a phone. One nav landmark
// in both frames, because it is one level of one model — which is what the type row replaced two
// registries and two components with.
export function typeRow(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Types' })
}

// A type's key in the row. Its accessible name carries the count when it has one ("Documents, 3 open"), so
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
      // Open but not in the row (the phone's row holds four) is the "Currently open" section instead.
      await searchSheet(page)
        .getByTestId(new RegExp(`^sheet:(new|open):${typeId.replace(/\./g, '\\.')}$`))
        .click()
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
  // Longer than the default expect timeout: a cold PGlite boots a WASM payload and then walks the vault,
  // and four workers per project can do that at once. The walk grows with the vault, which every spec
  // writes into — measured at ~20 s for 400 notes on an idle stand — so the bound is the test's own
  // timeout rather than a second, shorter one.
  await expect(page.locator('.index-state-text')).toContainText(/\d+ in index/, { timeout: 40_000 })
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
  await openType(page, 'Documents')
  // The second tap, which is what opens it.
  await typeKey(page, 'Documents').click()
  const list = page.getByRole('dialog', { name: 'Documents', exact: true })
  await expect(list).toBeVisible()
  return list
}

// One tab in the second-tap sheet. Its accessible name is the title and then the second line, which says
// whether it is the tab on screen — so this matches the title and either of the two.
export function tabEntry(list: Locator, title: string): Locator {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // The extension is optional: whether a known one is shown is a synced setting another spec may be toggling.
  return list.getByRole('button', { name: new RegExp(`^${escaped}(\\.[a-z0-9]+)? (Open|Current tab)$`) })
}

// Welcome is a utility panel on the Documents host — restored sessions often leave a document active
// instead, which is intentional. Bring the panel forward before asserting its on-screen actions.
export async function openWelcome(page: Page): Promise<void> {
  await openType(page, 'Documents')
  const find = page.getByRole('button', { name: 'Find a note', exact: true })
  if (await find.isVisible()) return

  if (await isMobileFrame(page)) {
    const list = await openDocumentList(page)
    await tabEntry(list, 'Welcome').click()
    await expect(list).toBeHidden()
  } else {
    // Accessible name is "Welcome Close" — the tab title plus its close control. Match exact so a
    // document whose path merely contains "welcome" does not steal the click.
    await page.getByRole('button', { name: 'Welcome Close', exact: true }).click()
  }
  await expect(find).toBeVisible()
}

export async function openSettingsSection(page: Page, section: string): Promise<void> {
  await openType(page, 'Settings', SETTINGS_TYPE)
  // The section list is the mini-app's own rail, which on the mobile frame has to be summoned. On
  // desktop it is already beside the content.
  await openNavigation(page)
  // Scoped to the section list: a section shares its name with the type of the same plugin (Search's
  // settings section and the Search type are both called "Search"), and an unscoped lookup would match
  // that type's key in the row as well once it is open.
  await page.locator('.settings-nav').getByRole('treeitem', { name: section, exact: true }).click()
}

// The first publish of a path asks before its content leaves encryption (FR-167, Q-05); a republish does
// not. Read the dialog's substance, not only its presence — a confirmation that says nothing is a click.
export async function confirmPublish(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Publish' })
  await expect(dialog).toContainText('unencrypted')
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(dialog).toBeHidden()
}

export async function openSecuritySettings(page: Page): Promise<void> {
  await openSettingsSection(page, 'Security')
  await expect(page.getByRole('heading', { name: 'Device identity' })).toBeVisible()
}

// A vault-strip control. The desktop strip draws each action as its own icon and moves the trailing ones
// into More as the column narrows. The phone has no vault strip: adding files is Upload in the three-step
// New, raised from the object bar, and the tree's housekeeping (Refresh, Collapse tree) is not offered there.
export async function vaultStripAction(page: Page, name: string): Promise<void> {
  if (await isMobileFrame(page)) {
    test.skip(name !== 'Add files…', `the phone vault has no "${name}"`)
    if (await navigationSheet(page).isVisible()) {
      await page.goBack()
      await expect(navigationSheet(page)).toBeHidden()
    }
    await page.getByTestId('object-bar').getByRole('button', { name: 'New document', exact: true }).click()
    await page.getByTestId('create-kind:upload').click()
    return
  }
  await openNavigation(page)
  const direct = page.getByRole('button', { name, exact: true })
  if (await direct.isVisible().catch(() => false)) {
    await direct.click()
    return
  }
  await page.getByRole('button', { name: 'More vault actions', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

// Publication row action: desktop exposes each icon; mobile keeps Copy link out and the rest behind More.
export async function publicationAction(row: Locator, name: string): Promise<void> {
  const direct = row.getByRole('button', { name, exact: true })
  if (await direct.isVisible().catch(() => false)) {
    await direct.click()
    return
  }
  await row.getByRole('button', { name: 'More publication actions', exact: true }).click()
  await row.page().getByRole('menuitem', { name, exact: true }).click()
}

// SQL console strip: Run is always out; Example/Schema sit behind More on mobile.
export async function sqlConsoleAction(panel: Locator, name: string): Promise<void> {
  const direct = panel.getByRole('button', { name, exact: true })
  if (await direct.isVisible().catch(() => false)) {
    await direct.click()
    return
  }
  await panel.getByRole('button', { name: 'More console actions', exact: true }).click()
  const menuName = name === 'Schema' ? /^(Show|Hide) schema$/ : name
  await panel.page().getByRole('menuitem', { name: menuName }).click()
}

export function storedMnemonic(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), IDENTITY_KEY)
}

export { expect }

// Touch actions have their own visible trigger; right-click remains the desktop route.
export async function openTreeActions(page: Page, row: Locator): Promise<void> {
  if (await isMobileFrame(page)) await row.getByRole('button', { name: /^Actions for / }).click()
  else await row.click({ button: 'right' })
}

const EDITOR_MODES = new Set(['Read only', 'Editable', 'Interactive'])

// The open document's own menu: "Document tools" in the desktop tab strip, the object bar's More on the
// phone — where the viewer's entries follow Rename and Close.
export async function openDocumentTools(page: Page): Promise<void> {
  if (await isMobileFrame(page)) {
    // While the keyboard is up the bar is the editing band and has no More: put it away, as the owner would.
    await setKeyboard(page, 0)
    const bar = page.getByTestId('object-bar')
    // The menu is the entries as they stand when it opens, and a viewer still loading offers them disabled.
    await expect(bar).not.toContainText(/Loading…|Opening…/)
    await bar.getByRole('button', { name: 'More actions', exact: true }).click()
  } else await page.getByRole('button', { name: 'Document tools', exact: true }).click()
}

// One entry of that menu, in whichever frame.
export async function documentTool(page: Page, name: string): Promise<void> {
  await viewerAction(page, name, { desktopMenu: 'Document tools' })
}

// An action of the open viewer. On the desktop it is a key of its own in the viewer's strip, or an entry of
// the strip's menu (`desktopMenu`). On the phone there is no strip: every tool of the viewer is an entry of
// the object bar's More. Two land elsewhere there — the editor mode is one row that opens the choice, and an
// editor's undo and redo live only in the editing band the keyboard raises, which a test cannot raise for
// real, so the phone reaches those by the editor's own chord: the same history either way.
export async function viewerAction(page: Page, name: string, options: { desktopMenu?: string } = {}): Promise<void> {
  if (!(await isMobileFrame(page))) {
    if (options.desktopMenu == null) {
      await page.getByRole('button', { name, exact: true }).click()
      return
    }
    await page.getByRole('button', { name: options.desktopMenu, exact: true }).click()
    await page.getByRole('menuitem', { name, exact: true }).click()
    return
  }
  await openDocumentTools(page)
  const items = page.getByRole('menuitem')
  await expect(items.first()).toBeVisible()
  const item = page.getByRole('menuitem', { name, exact: true })
  if ((await item.count()) > 0) {
    await item.click()
    return
  }
  if (EDITOR_MODES.has(name)) {
    await page.getByRole('menuitem', { name: /^Editor mode: / }).click()
    await item.click()
    return
  }
  if (name !== 'Undo' && name !== 'Redo') throw new Error(`the object bar offers no "${name}"`)
  await page.goBack()
  await expect(items.first()).toBeHidden()
  await page.locator('.ProseMirror:visible, .cm-content:visible').first().focus()
  await page.keyboard.press(name === 'Undo' ? 'ControlOrMeta+z' : 'ControlOrMeta+y')
}

// A soft keyboard cannot be raised from a test. An Android WebView shrinks the visual viewport and leaves
// the layout viewport alone, and that is the signal the phone frame reacts to — so this drives it. 0 puts
// the keyboard away again.
export async function setKeyboard(page: Page, covered: number): Promise<void> {
  await page.evaluate((height) => {
    const vv = window.visualViewport
    if (vv == null) throw new Error('visualViewport is unavailable')
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - height })
    vv.dispatchEvent(new Event('resize'))
  }, covered)
}

// The open document's formatting keys: a toolbar of the page on the desktop; on the phone the band the
// object bar becomes while the keyboard is up and the caret is in the text — so this puts both in place.
export async function formattingToolbar(page: Page): Promise<Locator> {
  if (!(await isMobileFrame(page))) return page.getByRole('toolbar', { name: 'Formatting' })
  const text = page.locator('.ProseMirror:visible, .cm-content:visible').first()
  if (!(await text.evaluate((el) => el.contains(document.activeElement)))) await text.focus()
  await setKeyboard(page, 300)
  const band = page.getByTestId('object-bar').getByRole('toolbar', { name: 'Formatting' })
  await expect(band).toBeVisible()
  return band
}

// Save the open document the way its frame offers it: a Save key where the viewer has one, the document's
// menu otherwise — and on the phone always the bar's More, with the keyboard put away so the bar is back.
export async function saveDocument(page: Page): Promise<void> {
  if (await isMobileFrame(page)) {
    await documentTool(page, 'Save')
    return
  }
  const key = page.getByRole('button', { name: 'Save', exact: true })
  if (await key.isVisible()) await key.click()
  else await documentTool(page, 'Save')
}

// A workbook's save state: the status line of its bar on the desktop; on the phone the quieter half of the
// object bar's name, which says nothing while the workbook is saved.
export async function expectSheetState(page: Page, state: string): Promise<void> {
  if (!(await isMobileFrame(page))) {
    await expect(page.locator('.sheet-status')).toHaveText(state)
    return
  }
  const name = page.getByTestId('object-bar-parts')
  if (state === 'Saved') await expect(name).not.toContainText(/Unsaved|Saving…|Save failed/)
  else await expect(name).toContainText(state)
}

// The toaster's region, by its label rather than its role: on the phone a toast often lands while a modal
// sheet is still up (a tree action inside the vault), and the sheet takes the rest of the page out of the
// accessibility tree.
export function toastRegion(page: Page): Locator {
  return page.locator('[aria-label^="Notifications"]')
}
