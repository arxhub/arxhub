import { fileURLToPath } from 'node:url'
import type { JoinerHandle } from '../fixtures/pairing-host'
import { enterCode } from './entry-helpers'
import { expect, OTHER_MNEMONIC, openSecuritySettings, SEEDED_MNEMONIC, storedMnemonic, test, waitForApp } from './fixtures'
import { lockDevice, serveSyncAddress, securityTask as task } from './security-helpers'

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
    await expect(app.getByTestId('security-show-phrase')).toBeVisible()
  })

  // The seeded device has no lock, so there is no code to ask for; the owner still confirms before the
  // words appear, because a stray tap must not put them on screen (FR-194).
  test('reveals the phrase only after the confirm, and hides it again', async ({ app }) => {
    await app.getByTestId('security-show-phrase').click()
    await expect(task(app)).toContainText('no code to ask for')
    await expect(app.getByTestId('recovery-phrase')).toBeHidden()

    await app.getByTestId('security-continue').click()
    const shown = app.getByTestId('recovery-phrase')
    for (const word of SEEDED_MNEMONIC.split(' ')) await expect(shown).toContainText(word)

    await app.getByTestId('phrase-done').click()
    await expect(app.getByTestId('recovery-phrase')).toBeHidden()
  })

  test('cancelling the confirm leaves the phrase hidden', async ({ app }) => {
    await app.getByTestId('security-show-phrase').click()
    await app.getByRole('button', { name: 'Cancel' }).click()
    await expect(app.getByTestId('recovery-phrase')).toBeHidden()
    await expect(task(app)).toBeHidden()
  })

  test('on a locked device the phrase asks for the code, every time', async ({ app }) => {
    await lockDevice(app, UNLOCK_CODE)
    await enterCode(app, 'unlock-code', UNLOCK_CODE)
    await waitForApp(app)
    await openSecuritySettings(app)

    await app.getByTestId('security-show-phrase').click()
    await expect(app.getByRole('dialog', { name: 'Enter the code' })).toContainText('To show the recovery phrase.')
    await enterCode(app, 'reentry-code', '000000')
    await expect(task(app).getByRole('alert')).toContainText('Wrong code')
    await expect(app.getByTestId('recovery-phrase')).toBeHidden()

    await enterCode(app, 'reentry-code', UNLOCK_CODE)
    await expect(app.getByTestId('recovery-phrase')).toContainText(SEEDED_MNEMONIC.split(' ')[0] ?? '')
    await app.getByTestId('phrase-done').click()

    // The code let the phrase out once; a second showing asks again.
    await app.getByTestId('security-show-phrase').click()
    await expect(app.getByRole('dialog', { name: 'Enter the code' })).toBeVisible()
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

    // The identity is read before ArxHub.start(), so applying it means a reload, not a live swap — and the
    // reload starts on the app's own schedule. Reading the profile straight after loses the race about one
    // run in three ("Execution context was destroyed"), and expect.poll does not retry a callback that
    // throws: a read taken mid-navigation answers null and the next one, after the reload, is the real one.
    await app.waitForLoadState('domcontentloaded')
    await expect.poll(() => storedMnemonic(app).catch(() => null), { timeout: 15_000 }).toBe(phrase)
    expect(await vault.read(kept)).toContain('# kept')
  })

  test('locking the device encrypts the phrase at rest and gates the next boot', async ({ app }) => {
    await lockDevice(app, UNLOCK_CODE)

    // The point of the whole feature: the phrase is no longer readable off the profile.
    const atRest = await storedMnemonic(app)
    expect(atRest).not.toBe(SEEDED_MNEMONIC)
    expect(atRest).toMatch(/^[0-9a-f]+$/)

    // Six digits submit themselves: there is no Unlock button to press.
    await app.getByLabel('Unlock code').fill(UNLOCK_CODE)
    await waitForApp(app)
  })

  test('a wrong code does not get past the gate', async ({ app }) => {
    await lockDevice(app, UNLOCK_CODE)

    await app.getByLabel('Unlock code').fill('000000')

    await expect(app.getByRole('alert')).toContainText('Wrong code')
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
    await waitForApp(app)
  })
})

const pairingModule = `/@fs${fileURLToPath(new URL('../fixtures/pairing-host.ts', import.meta.url))}`

test.describe('Connect a device', () => {
  test('is unavailable without a sync server, and says where to set one', async ({ app }) => {
    await serveSyncAddress(app, '')
    await openSecuritySettings(app)

    const row = app.getByTestId('security-pair')
    await expect(row).toBeDisabled()
    await expect(row).toContainText('Connect a sync server first')
    await app.getByTestId('security-connect-server').click()
    await expect(app.getByRole('heading', { name: 'Sync', exact: true })).toBeVisible()
  })

  test('shows the invitation, compares the digits and hands the key over', async ({ app, baseURL }) => {
    const server = new URL(baseURL ?? '').origin
    await serveSyncAddress(app, server)
    await openSecuritySettings(app)

    await app.getByTestId('security-pair').click()
    // The seeded device has no lock, so the owner confirms instead of re-entering a code.
    await app.getByTestId('security-continue').click()
    await expect(app.getByTestId('pairing-qr')).toBeVisible()
    await expect(app.getByTestId('pairing-server')).toHaveText(server)
    await expect(app.getByTestId('pairing-status')).toContainText(/valid for \d:\d\d/)
    const code = (await app.getByTestId('pairing-code').textContent()) ?? ''
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)

    // The new device, driven in the same page: it needs nothing but the relay and the code.
    await app.evaluate(
      async ([module, typed]) => {
        const { startPairingJoiner } = (await import(module)) as { startPairingJoiner: (c: string) => JoinerHandle }
        ;(window as unknown as { joiner: JoinerHandle }).joiner = startPairingJoiner(typed)
      },
      [pairingModule, code] as const,
    )
    const joinerSas = () => app.evaluate(() => (window as unknown as { joiner: JoinerHandle }).joiner.sas())
    const joinerPayload = () => app.evaluate(() => (window as unknown as { joiner: JoinerHandle }).joiner.payload())

    await expect(app.getByRole('dialog', { name: 'Compare the digits' })).toContainText('E2E phone is connecting')
    await expect.poll(joinerSas).not.toBeNull()
    const sas = (await joinerSas()) as string
    await expect(app.getByTestId('pairing-sas')).toHaveText(`${sas.slice(0, 3)} ${sas.slice(3)}`)

    await app.evaluate(() => (window as unknown as { joiner: JoinerHandle }).joiner.confirm())
    await app.getByTestId('pairing-confirm').click()
    await expect(app.getByRole('dialog', { name: 'Device connected' })).toContainText('E2E phone received the vault key.')
    await expect.poll(joinerPayload).toEqual({ v: 1, mnemonic: SEEDED_MNEMONIC, serverUrl: server })
  })

  test('asks for the code every time on a locked device', async ({ app, baseURL }) => {
    await serveSyncAddress(app, new URL(baseURL ?? '').origin)
    await openSecuritySettings(app)
    await lockDevice(app, UNLOCK_CODE)
    await enterCode(app, 'unlock-code', UNLOCK_CODE)
    await waitForApp(app)
    await openSecuritySettings(app)

    for (let round = 0; round < 2; round++) {
      await app.getByTestId('security-pair').click()
      const dialog = app.getByRole('dialog', { name: 'Enter the code' })
      await expect(dialog).toContainText('To show the connection QR — it hands out the vault key.')
      await enterCode(app, 'reentry-code', UNLOCK_CODE)
      await expect(app.getByTestId('pairing-qr')).toBeVisible()
      await app.getByTestId('pairing-cancel').click()
      await expect(task(app)).toBeHidden()
    }
  })
})
