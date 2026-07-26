import { expect, OTHER_MNEMONIC, openSecuritySettings, SEEDED_MNEMONIC, storedMnemonic, test } from './fixtures'

const UNLOCK_CODE = '314159'

test.describe('Security settings', () => {
  test.beforeEach(async ({ app }) => {
    await openSecuritySettings(app)
  })

  test('shows the device public key', async ({ app }) => {
    // xpub is what a server pins at pairing (FR-193).
    await expect(app.getByTestId('public-key')).toContainText(/^xpub/)
  })

  test('keeps the recovery phrase hidden until it is asked for', async ({ app }) => {
    await expect(app.getByTestId('recovery-phrase')).toBeHidden()
    await expect(app.getByRole('button', { name: 'Show recovery phrase' })).toBeVisible()
  })

  test('reveals the phrase only after the confirm, and hides it again', async ({ app }) => {
    await app.getByRole('button', { name: 'Show recovery phrase' }).click()

    // The confirm is the point of the requirement: the words must not appear by a stray click (FR-194).
    await expect(app.getByRole('dialog')).toContainText('Anyone who reads these words')
    await expect(app.getByTestId('recovery-phrase')).toBeHidden()

    await app.getByRole('button', { name: 'Show', exact: true }).click()
    await expect(app.getByTestId('recovery-phrase')).toHaveText(SEEDED_MNEMONIC)

    await app.getByRole('button', { name: 'Hide' }).click()
    await expect(app.getByTestId('recovery-phrase')).toBeHidden()
  })

  test('cancelling the confirm leaves the phrase hidden', async ({ app }) => {
    await app.getByRole('button', { name: 'Show recovery phrase' }).click()
    await app.getByRole('button', { name: 'Cancel' }).click()
    await expect(app.getByTestId('recovery-phrase')).toBeHidden()
  })

  test('rejects a phrase that fails its checksum', async ({ app }) => {
    const replace = app.getByRole('button', { name: 'Replace identity' })
    await expect(replace).toBeDisabled()

    // Twelve real words in the wordlist, wrong checksum — the case a typo actually produces.
    await app.getByTestId('recovery-phrase-entry').fill('legal winner thank year wave sausage worth useful legal winner thank zoo')
    await expect(app.getByText('Not a valid recovery phrase')).toBeVisible()
    await expect(replace).toBeDisabled()
  })

  test('accepts a valid phrase and leaves the identity untouched until confirmed', async ({ app }) => {
    await app.getByTestId('recovery-phrase-entry').fill(OTHER_MNEMONIC)
    await expect(app.getByText('Not a valid recovery phrase')).toBeHidden()

    const replace = app.getByRole('button', { name: 'Replace identity' })
    await expect(replace).toBeEnabled()

    await replace.click()
    await expect(app.getByRole('dialog')).toContainText('stop being the owner it is now')
    await app.getByRole('button', { name: 'Cancel' }).click()

    expect(await storedMnemonic(app)).toBe(SEEDED_MNEMONIC)
  })

  test('confirming the replacement applies the new phrase and restarts', async ({ app }) => {
    await app.getByTestId('recovery-phrase-entry').fill(OTHER_MNEMONIC)
    await app.getByRole('button', { name: 'Replace identity' }).click()
    await app.getByRole('button', { name: 'Replace identity' }).last().click()

    // The identity is read before ArxHub.start(), so applying it means a reload, not a live swap.
    await app.waitForLoadState('domcontentloaded')
    await expect.poll(() => storedMnemonic(app)).toBe(OTHER_MNEMONIC)
  })

  test('locking the device encrypts the phrase at rest and gates the next boot', async ({ app }) => {
    await app.getByTestId('new-unlock-code').fill(UNLOCK_CODE)
    await app.getByRole('button', { name: 'Lock this device' }).click()
    await app.getByRole('button', { name: 'Lock device' }).click()

    // Applying the lock reloads, and the reload must not get past the gate.
    await expect(app.getByRole('heading', { name: 'Unlock ArxHub' })).toBeVisible()

    // The point of the whole feature: the phrase is no longer readable off the profile.
    const atRest = await storedMnemonic(app)
    expect(atRest).not.toBe(SEEDED_MNEMONIC)
    expect(atRest).toMatch(/^[0-9a-f]+$/)

    await app.getByLabel('Unlock code').fill(UNLOCK_CODE)
    await app.getByRole('button', { name: 'Unlock' }).click()
    await expect(app.getByRole('main')).toBeVisible()
  })

  test('a wrong code does not get past the gate', async ({ app }) => {
    await app.getByTestId('new-unlock-code').fill(UNLOCK_CODE)
    await app.getByRole('button', { name: 'Lock this device' }).click()
    await app.getByRole('button', { name: 'Lock device' }).click()
    await expect(app.getByRole('heading', { name: 'Unlock ArxHub' })).toBeVisible()

    await app.getByLabel('Unlock code').fill('000000')
    await app.getByRole('button', { name: 'Unlock' }).click()

    await expect(app.getByRole('alert')).toContainText('That code did not work')
    await expect(app.getByRole('main')).toBeHidden()
  })

  // After the reload the stand still has the previous key pinned, so every vault call answers 401.
  // The app must still come up: otherwise a mistyped phrase is unrecoverable without devtools,
  // because Settings — the one place that can correct it — lives inside the app.
  test('stays usable when the server rejects the new identity', async ({ app }) => {
    await app.getByTestId('recovery-phrase-entry').fill(OTHER_MNEMONIC)
    await app.getByRole('button', { name: 'Replace identity' }).click()
    await app.getByRole('button', { name: 'Replace identity' }).last().click()

    await app.waitForLoadState('domcontentloaded')
    await expect(app.getByRole('main')).toBeVisible()
  })
})
