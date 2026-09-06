import { expect, OTHER_MNEMONIC, openSecuritySettings, SEEDED_MNEMONIC, storedMnemonic, test } from './fixtures'

const UNLOCK_CODE = '314159'

// Replacing the identity now leaves a record on disk of who the vault belongs to, and both Playwright
// projects share the stand's data dir. Two projects entering the SAME phrase would race: whichever got
// there first would turn the other's "someone else's phrase" into "the phrase these files belong to",
// and the test would stop testing what it is named after. One phrase per writing test per project.
const APPLIED_PHRASES: Record<string, Record<string, string>> = {
  kept: {
    desktop: 'improve crazy survey chalk flag prize tube retire blast split nose grant',
    mobile: 'slight blood glory echo quick essay sustain truly merry cargo razor dash',
  },
  rejected: {
    desktop: 'journey adult spin frost trim runway clay print alpha toward ranch salad',
    mobile: 'six gym message kit project frost snack clown critic interest lemon oven',
  },
}

function phraseFor(group: keyof typeof APPLIED_PHRASES): string {
  const phrase = APPLIED_PHRASES[group][test.info().project.name]
  if (!phrase) throw new Error(`No phrase reserved for ${group} on project ${test.info().project.name}`)
  return phrase
}

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

  test('recognises this device’s own phrase instead of offering to replace it', async ({ app, vault }) => {
    // A vault with something in it: an empty one has nothing to lose and is deliberately never asked.
    await vault.write('owned.md', '# still here')
    await app.reload()
    await openSecuritySettings(app)

    await app.getByTestId('recovery-phrase-entry').fill(SEEDED_MNEMONIC)

    // The checksum passes for any twelve valid words, which used to be enough to reach the destructive
    // confirm. The phrase is now compared with the identity this device actually has.
    await expect(app.getByTestId('phrase-verdict')).toContainText('already this device')
    await expect(app.getByRole('button', { name: 'Replace identity' })).toBeDisabled()
  })

  // OTHER_MNEMONIC is safe to share between the projects here precisely because this test cancels:
  // nothing is ever written under it, so it cannot become the recorded owner of anything.
  test('asks what happens to the local files, and cancelling changes nothing', async ({ app, vault }) => {
    await vault.write('asked-about.md', '# keep me')
    await app.reload()
    await openSecuritySettings(app)

    await app.getByTestId('recovery-phrase-entry').fill(OTHER_MNEMONIC)
    await expect(app.getByText('Not a valid recovery phrase')).toBeHidden()
    await app.getByRole('button', { name: 'Replace identity' }).click()

    const dialog = app.getByRole('dialog')
    await expect(dialog).toContainText('belongs to a different owner')
    // Both branches are named and neither is pressed for the user — there is no default.
    await expect(dialog.getByTestId('handover-keep')).toBeVisible()
    await expect(dialog.getByTestId('handover-take-server')).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(await storedMnemonic(app)).toBe(SEEDED_MNEMONIC)
  })

  test('keeping the local files applies the new phrase and leaves the vault alone', async ({ app, vault }) => {
    const phrase = phraseFor('kept')
    const kept = await vault.write('kept.md', '# kept')
    await app.reload()
    await openSecuritySettings(app)

    await app.getByTestId('recovery-phrase-entry').fill(phrase)
    await app.getByRole('button', { name: 'Replace identity' }).click()
    await app.getByTestId('handover-keep').click()

    // The identity is read before ArxHub.start(), so applying it means a reload, not a live swap.
    await app.waitForLoadState('domcontentloaded')
    await expect.poll(() => storedMnemonic(app)).toBe(phrase)
    expect(await vault.read(kept)).toContain('# kept')
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
  test('stays usable when the server rejects the new identity', async ({ app, vault }) => {
    await vault.write('rejected.md', '# note')
    await app.reload()
    await openSecuritySettings(app)

    await app.getByTestId('recovery-phrase-entry').fill(phraseFor('rejected'))
    await app.getByRole('button', { name: 'Replace identity' }).click()
    await app.getByTestId('handover-keep').click()

    await app.waitForLoadState('domcontentloaded')
    await expect(app.getByRole('main')).toBeVisible()
  })
})
