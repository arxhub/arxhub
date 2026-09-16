import { expect, openNavigation, openSettingsSection, test, typeRow, waitForApp } from './fixtures'

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

// A fast boot deliberately shows nothing — the screen appears only once the wait is long enough to be
// worth explaining. Holding every API call is what makes this boot slow honestly: the plugins that
// read config or the vault really are waiting, which is exactly the case the screen exists for.
test('a slow boot says which plugins it is still waiting for', async ({ app }) => {
  await app.route('**/api/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })
  const reload = app.reload()

  const screen = app.getByRole('status', { name: 'Starting ArxHub' })
  await expect(screen).toBeVisible()
  // The count is the summary and the roster is the detail: a bar alone cannot name what is holding
  // things up, which is the only reason to look at this screen at all.
  await expect(screen).toContainText(/\d+ of \d+ plugins ready/)
  await expect(screen.getByText('Shell', { exact: true })).toBeVisible()

  // And it gets out of the way on its own once the boot is through — no click, no timeout.
  await reload
  await expect(screen).toBeHidden()
  await waitForApp(app)
})
