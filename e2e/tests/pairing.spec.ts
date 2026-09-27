import { type BrowserContext, devices, type Page } from '@playwright/test'
import { createCode, ENTRY_KEY, IDENTITY_KEY } from './entry-helpers'
import { expect, openSecuritySettings, SEEDED_MNEMONIC, test } from './fixtures'
import { securityTask, serveSyncAddress } from './security-helpers'

// Two devices, both through their own screens: the first is the suite's device in Settings → Security,
// the new one a second browser context on the first run. Only the relay is shared, so this is the whole
// handover as the owner does it — including both refusals the digits exist for.
//
// The new device's sync routes are refused: on a browser bundle its vault is the stand's shared tree, and a
// finished join would write its sync address into the config every other test reads.

const DEVICE_BY_PROJECT: Record<string, (typeof devices)[string]> = {
  desktop: devices['Desktop Chrome'],
  mobile: devices['Pixel 7'],
}

async function newDevice(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await page.route('**/api/sync/**', (route) => route.abort('connectionrefused'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'ArxHub' })).toBeVisible()
  await page.getByTestId('entry-join-vault').click()
  return page
}

async function typeInvitation(page: Page, code: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'How to connect' })).toBeVisible()
  await page.getByTestId('join-by-invitation').click()
  const manual = page.getByTestId('scan-manual')
  if (await manual.isVisible()) await manual.click()
  await expect(page.getByRole('heading', { name: 'Connect by code' })).toBeVisible()
  await page.getByTestId('invite-code').fill(code)
  await page.getByTestId('invite-next').click()
}

async function invitationCode(first: Page): Promise<string> {
  await expect(first.getByTestId('pairing-qr')).toBeVisible()
  const code = (await first.getByTestId('pairing-code').textContent()) ?? ''
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  return code
}

// Both screens show the same six digits: that is the check the owner is asked to make.
async function sameDigits(first: Page, joining: Page): Promise<void> {
  await expect(joining.getByRole('heading', { name: 'Compare the digits' })).toBeVisible()
  await expect(first.getByRole('dialog', { name: 'Compare the digits' })).toBeVisible()
  const shown = (await joining.getByTestId('pairing-sas').textContent()) ?? ''
  expect(shown).toMatch(/^\d{3} \d{3}$/)
  await expect(first.getByTestId('pairing-sas')).toHaveText(shown)
}

test.describe('Connecting a device by an invitation, device to device', () => {
  test('refused on either device, then handed over when both confirm', async ({ app, baseURL, browser }) => {
    const server = new URL(baseURL ?? '').origin
    await serveSyncAddress(app, server)
    await openSecuritySettings(app)
    await app.getByTestId('security-pair').click()
    // The suite's device has no lock, so the owner confirms instead of re-entering a code.
    await app.getByTestId('security-continue').click()
    await expect(app.getByTestId('pairing-server')).toHaveText(server)

    const context = await browser.newContext({ ...DEVICE_BY_PROJECT[test.info().project.name], baseURL })
    try {
      const joining = await newDevice(context)

      // 1. The new device says the digits differ: nothing it was handed is opened, and the first device
      // learns the invitation is over.
      const first = await invitationCode(app)
      await typeInvitation(joining, first)
      await sameDigits(app, joining)
      await joining.getByTestId('join-mismatch').click()
      await expect(joining.getByRole('heading', { name: 'Not connected' })).toBeVisible()
      await expect(joining.getByTestId('join-error')).toContainText("The digits didn't match, so nothing was taken")
      await expect(app.getByRole('dialog', { name: 'Not connected' })).toBeVisible()
      await expect(app.getByTestId('pairing-error')).toBeVisible()

      // 2. The first device says they differ: the key is not sent, a new invitation replaces the old one,
      // and the new device is told the connection stopped.
      await app.getByTestId('pairing-restart').click()
      const second = await invitationCode(app)
      expect(second).not.toBe(first)
      await joining.getByTestId('join-cancel').click()
      await typeInvitation(joining, second)
      await sameDigits(app, joining)
      await app.getByTestId('pairing-reject').click()
      const third = await invitationCode(app)
      expect(third).not.toBe(second)
      await expect(joining.getByRole('heading', { name: 'Not connected' })).toBeVisible()
      expect(await joining.evaluate((key) => localStorage.getItem(key), IDENTITY_KEY)).toBeNull()

      // 3. Both confirm: the key arrives, and the new device goes on to its own code and the download.
      await joining.getByTestId('join-cancel').click()
      await typeInvitation(joining, third)
      await sameDigits(app, joining)
      await joining.getByTestId('join-match').click()
      await expect(joining.getByTestId('join-status')).toHaveText('Waiting for confirmation on the first device…')
      await app.getByTestId('pairing-confirm').click()
      await expect(app.getByRole('dialog', { name: 'Device connected' })).toContainText('received the vault key.')
      await expect(joining.getByRole('heading', { name: 'Key received' })).toBeVisible()
      await joining.getByTestId('key-received-next').click()

      await createCode(joining, 3)
      await expect(joining.getByTestId('initial-download')).toBeVisible()
      const stored = await joining.evaluate(
        ([identity, entry]) => ({ identity: localStorage.getItem(identity), entry: localStorage.getItem(entry) }),
        [IDENTITY_KEY, ENTRY_KEY] as const,
      )
      expect(stored.identity).not.toBeNull()
      for (const word of SEEDED_MNEMONIC.split(' ')) expect(stored.identity).not.toContain(word)
      expect(JSON.parse(stored.entry ?? '{}')).toMatchObject({ v: 1, kind: 'join', serverUrl: server })

      await app.getByRole('button', { name: 'Done' }).click()
      await expect(securityTask(app)).toBeHidden()
    } finally {
      await context.close()
    }
  })
})
