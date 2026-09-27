import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import type { HostHandle } from '../fixtures/pairing-host'
import { createCode, ENTRY_KEY, IDENTITY_KEY } from './entry-helpers'
import { expect, SEEDED_MNEMONIC, test } from './fixtures'

// A device joining an existing vault, on a device that holds nothing — the bare `page`, never `app`.
//
// What these tests do NOT do is let a join's first download reach the stand: on a browser bundle the
// vault is the server's own tree, which every other test of the project shares, and a finished join
// writes its sync address into that shared config. So the phrase road stops at the server check, and
// the invitation road ends on the download screen with the sync routes answered as unreachable — which
// is also the screen's own failure state, the one with no way into the app but "Try again".

const hostModule = `/@fs${fileURLToPath(new URL('../fixtures/pairing-host.ts', import.meta.url))}`
const seedModule = `/@fs${fileURLToPath(new URL('../fixtures/seed-remote.ts', import.meta.url))}`

// The suite's phrase with two words swapped so that every word is valid and the checksum is not.
function misordered(phrase: string): string {
  const words = phrase.split(' ')
  for (let i = 1; i < words.length; i++) {
    const swapped = [...words]
    ;[swapped[0], swapped[i]] = [swapped[i], swapped[0]]
    const text = swapped.join(' ')
    if (text !== phrase && !validateMnemonic(text, wordlist)) return text
  }
  throw new Error('no misordering of the phrase fails its checksum')
}

async function toJoinMethod(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'ArxHub' })).toBeVisible()
  await page.getByTestId('entry-join-vault').click()
  await expect(page.getByRole('heading', { name: 'How to connect' })).toBeVisible()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
}

test.describe('Connecting a device by its recovery phrase', () => {
  test.beforeEach(async ({ page }) => {
    // Answered here, never by the stand: see the note at the top.
    await page.route('**/api/sync/head', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"head":null}' }))
    await page.goto('/')
  })

  test('says which words are wrong, then which order, and checks the server with the phrase', async ({ page }) => {
    await toJoinMethod(page)
    await page.getByTestId('join-by-phrase').click()
    await expect(page.getByRole('heading', { name: 'Recovery phrase' })).toBeVisible()
    await expect(page.getByTestId('phrase-next')).toBeDisabled()

    // A prefix is on its way to a word, and offers it; taking it moves on to the next field.
    const first = page.getByTestId('phrase-word-1')
    await first.fill('lega')
    await expect(page.getByTestId('phrase-problem')).toHaveCount(0)
    await page.getByTestId('phrase-suggestion-legal').click()
    await expect(first).toHaveValue('legal')
    await expect(page.getByTestId('phrase-word-2')).toBeFocused()

    // Something that is not a word is flagged once the caret has left it.
    await page.getByTestId('phrase-word-2').fill('winnerx')
    await page.getByTestId('phrase-word-3').focus()
    await expect(page.getByTestId('phrase-problem')).toHaveText("This word isn't in the phrase list — check the spelling")

    // A whole phrase pasted into one field fills all twelve.
    await first.fill(misordered(SEEDED_MNEMONIC))
    await expect(page.getByTestId('phrase-word-12')).not.toHaveValue('')
    await expect(page.getByTestId('phrase-problem')).toHaveText("The words are right, but the phrase doesn't add up — check the order")
    await expect(page.getByTestId('phrase-next')).toBeDisabled()

    await first.fill(SEEDED_MNEMONIC)
    await expect(page.getByTestId('phrase-problem')).toHaveCount(0)
    await page.getByTestId('phrase-next').click()

    await expect(page.getByRole('heading', { name: 'Where is your vault' })).toBeVisible()
    await expect(page.getByText('Step 2 of 4')).toBeVisible()
    await expect(page.getByTestId('server-address')).toHaveText(new URL(page.url()).origin)
    // An empty server is not where this vault is: said, and no way on.
    await expect(page.getByTestId('server-status')).toHaveText('No vault for this phrase on this server yet')
    await expect(page.getByTestId('server-next')).toHaveCount(0)

    // Back keeps what was typed.
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByTestId('phrase-word-12')).toHaveValue('yellow')

    // Nothing was written: the phrase stays in memory until the code step.
    expect(await page.evaluate((key) => localStorage.getItem(key), IDENTITY_KEY)).toBeNull()
  })
})

test.describe('Connecting a device by its recovery phrase, against the stand', () => {
  test('the stand holds the vault, the code locks the phrase, and the download holds the app', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'ArxHub' })).toBeVisible()
    // The suite's identity is the one the stand has pinned, so the vault it holds is this phrase's.
    await page.evaluate(
      async ([module, mnemonic]) => {
        const { seedRemoteVault } = (await import(module)) as {
          seedRemoteVault: (m: string, path: string, text: string) => Promise<void>
        }
        await seedRemoteVault(mnemonic, 'vault/joined-by-phrase.md', '# joined')
      },
      [seedModule, SEEDED_MNEMONIC] as const,
    )

    await toJoinMethod(page)
    await page.getByTestId('join-by-phrase').click()
    await page.getByTestId('phrase-word-1').fill(SEEDED_MNEMONIC)
    await page.getByTestId('phrase-next').click()

    await expect(page.getByRole('heading', { name: 'Where is your vault' })).toBeVisible()
    await expect(page.getByTestId('server-address')).toHaveText(new URL(page.url()).origin)
    await expect(page.getByTestId('server-status')).toHaveText('Vault found · 1 document · 8 B')

    // From here on the download must not reach the stand: see the note at the top.
    await page.route('**/api/sync/**', (route) => route.abort('connectionrefused'))
    await page.getByTestId('server-next').click()
    await createCode(page, 3)

    await expect(page.getByTestId('initial-download')).toBeVisible()
    await expect(page.getByTestId('download-retry')).toBeVisible()
    await expect(page.locator('main')).toHaveCount(0)
    const stored = await page.evaluate(
      ([identity, entry]) => ({ identity: localStorage.getItem(identity), entry: localStorage.getItem(entry) }),
      [IDENTITY_KEY, ENTRY_KEY] as const,
    )
    expect(stored.identity).not.toBeNull()
    for (const word of SEEDED_MNEMONIC.split(' ')) expect(stored.identity).not.toContain(word)
    expect(JSON.parse(stored.entry ?? '{}')).toMatchObject({ v: 1, kind: 'join', serverUrl: new URL(page.url()).origin })
  })
})

test.describe('Connecting a device by an invitation', () => {
  test('the typed code, the digits both devices show, the key, the code — and the download holds the app', async ({ page, browser }) => {
    // The first device: any page of the stand can drive the host half, and it signs as the suite's
    // identity, which the stand has already pinned.
    const baseURL = test.info().project.use.baseURL
    const firstContext = await browser.newContext({ baseURL })
    const first = await firstContext.newPage()
    try {
      await first.goto('/')
      await first.evaluate(
        async ([module, mnemonic]) => {
          const { startPairingHost } = (await import(module)) as { startPairingHost: (m: string) => HostHandle }
          ;(window as unknown as { host: HostHandle }).host = startPairingHost(mnemonic)
        },
        [hostModule, SEEDED_MNEMONIC] as const,
      )
      const hostCode = () => first.evaluate(() => (window as unknown as { host: HostHandle }).host.code())
      const hostSas = () => first.evaluate(() => (window as unknown as { host: HostHandle }).host.sas())
      const hostPhase = () => first.evaluate(() => (window as unknown as { host: HostHandle }).host.phase())
      await expect.poll(hostCode).not.toBeNull()
      const code = (await hostCode()) as string

      // The new device. The sync routes are answered as unreachable so the first download can never
      // reach the stand's shared tree.
      await page.route('**/api/sync/**', (route) => route.abort('connectionrefused'))
      await page.goto('/')
      await toJoinMethod(page)
      await page.getByTestId('join-by-invitation').click()
      // Chromium offers the page's camera; the typed code is one tap away either way.
      const manual = page.getByTestId('scan-manual')
      if (await manual.isVisible()) await manual.click()

      await expect(page.getByRole('heading', { name: 'Connect by code' })).toBeVisible()
      await page.getByTestId('invite-code').fill('0000-000')
      await page.getByTestId('invite-next').click()
      await expect(page.getByText('An invitation code is 8 letters and digits, as on the first device')).toBeVisible()
      await page.getByTestId('invite-code').fill(code.toLowerCase())
      await page.getByTestId('invite-next').click()

      await expect(page.getByRole('heading', { name: 'Compare the digits' })).toBeVisible()
      await expect(page.getByTestId('pairing-sas')).toBeVisible()
      await expect.poll(hostSas).not.toBeNull()
      const sas = (await hostSas()) as string
      await expect(page.getByTestId('pairing-sas')).toHaveText(`${sas.slice(0, 3)} ${sas.slice(3)}`)
      await page.getByTestId('join-match').click()
      await expect(page.getByTestId('join-status')).toHaveText('Waiting for confirmation on the first device…')

      await first.evaluate(() => (window as unknown as { host: HostHandle }).host.confirm())
      await expect(page.getByRole('heading', { name: 'Key received' })).toBeVisible()
      await expect.poll(hostPhase).toBe('done')
      await page.getByTestId('key-received-next').click()

      await createCode(page, 3)

      // The last step is sync's, and it holds the app: with the server unreachable it says so and offers
      // only to try again.
      await expect(page.getByTestId('initial-download')).toBeVisible()
      await expect(page.getByText('Step 4 of 4')).toBeVisible()
      await expect(page.getByTestId('download-retry')).toBeVisible()
      await expect(page.locator('main')).toHaveCount(0)

      const stored = await page.evaluate(
        ([identity, entry]) => ({ identity: localStorage.getItem(identity), entry: localStorage.getItem(entry) }),
        [IDENTITY_KEY, ENTRY_KEY] as const,
      )
      // The phrase arrived and is at rest only under the code.
      expect(stored.identity).not.toBeNull()
      for (const word of SEEDED_MNEMONIC.split(' ')) expect(stored.identity).not.toContain(word)
      expect(JSON.parse(stored.entry ?? '{}')).toMatchObject({ v: 1, kind: 'join', serverUrl: new URL(page.url()).origin })
    } finally {
      await firstContext.close()
    }
  })
})
