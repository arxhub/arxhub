import { expect, openNavigation, openSettingsSection, searchSheet, test, typeRow, waitForApp } from './fixtures'

test.describe('application boot', () => {
  test('comes up with the row of types', async ({ app }) => {
    // The first level of navigation, and the same one in both frames: a rail down the left of a window,
    // a row along the bottom of a phone. A type is named the same in both — there is one registration,
    // so there is nothing left for the two frames to disagree about.
    await expect(typeRow(app).getByRole('button', { name: /^Notes(,|$)/ })).toBeVisible()
    // Notes is the only pinned type: settings, search and the log viewer are reached from the sheet
    // (OR-05), so the row carries no key for them until one is open.
    await expect(typeRow(app).getByRole('button', { name: /^Settings(,|$)/ })).toHaveCount(0)
  })

  test('reaches the working tree over the protected API', async ({ app }) => {
    const response = await app.request.get('/healthcheck')
    expect(response.status()).toBe(200)
    // FR-210: the server names its build to whoever can reach it, and FR-43 bounds the answer to exactly
    // that — the key set is asserted, not just the two fields.
    const body = (await response.json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['status', 'version'])
    expect(body).toMatchObject({ status: 'ok', version: expect.stringMatching(/^\d+\.\d+\.\d+/) })

    // The listener goes on BEFORE the boot that makes the calls. The vault is read while the app comes
    // up, so a watcher installed once `app` had already booted could never have seen a refusal — which
    // is what this used to be, and why it would have passed with every /vfs call answered 401.
    const refused: string[] = []
    app.on('response', (r) => {
      if (r.url().includes('/api/vfs') && r.status() === 401) refused.push(r.url())
    })
    await app.reload()
    await waitForApp(app)

    // The dev stand guards /vfs with signed-request auth, so a rendered tree is the whole client↔server
    // chain and not just paint: the seeded identity signed a request and the server accepted it.
    await openNavigation(app)
    await expect(app.getByRole('tree', { name: 'Files' })).toBeVisible()
    expect(refused).toEqual([])
  })
})

test.describe('about', () => {
  test('reports the running version', async ({ app }) => {
    await openSettingsSection(app, 'About')
    // FR-210: the version has to be nameable when reporting a problem.
    await expect(app.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+/)
  })
})

// Network-backed plugin bring-up is detached from start(): the shell must paint and work while config,
// the repository and the search index are still waiting for the HTTP VFS. A barrier rather than a fixed
// delay makes the ordering exact — every assertion in the try block happens before any API answer.
test('slow plugin bring-up does not hold the first paint', async ({ app }) => {
  let releaseApi!: () => void
  const apiReleased = new Promise<void>((resolve) => {
    releaseApi = resolve
  })
  let markApiHeld!: () => void
  const apiHeld = new Promise<void>((resolve) => {
    markApiHeld = resolve
  })

  await app.route('**/api/**', async (route) => {
    markApiHeld()
    await apiReleased
    await route.continue()
  })
  const reload = app.reload()

  try {
    await apiHeld
    await waitForApp(app)
    await expect(typeRow(app).getByRole('button', { name: /^Notes(,|$)/ })).toBeVisible()
    await expect(app.getByRole('status', { name: 'Starting ArxHub' })).toHaveCount(0)

    // Paint is useful, not decorative: the app-layer chord and its registered surfaces already work.
    await app.keyboard.press('ControlOrMeta+k')
    await expect(searchSheet(app)).toBeVisible()
    // Ark installs the dialog's Escape listener on the next animation frame after it becomes visible.
    await app.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    await app.keyboard.press('Escape')
    await expect(searchSheet(app)).toBeHidden()
  } finally {
    // Never leave route handlers parked when an assertion fails: Playwright still has to tear the page down.
    releaseApi()
  }

  await reload
  await waitForApp(app)
  await openNavigation(app)
  await expect(app.getByRole('tree', { name: 'Files' })).toBeVisible()
})
