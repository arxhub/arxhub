import type { Page } from '@playwright/test'
import { createCode, ENTRY_CODE, ENTRY_KEY, enterCode, IDENTITY_KEY, VERIFIER_KEY } from './entry-helpers'
import { expect, test } from './fixtures'

// The first run, on a device that holds nothing. These tests take the bare `page`, never `app`: the
// `app` fixture seeds the suite's identity, and a seeded device never sees the chooser.
//
// The stand's server has already pinned the suite's key (global-setup), so a fresh vault's key is one it
// refuses. The server check is answered here instead of there: it keeps the status line deterministic,
// and — more to the point — a check that reached an UNPINNED server would pin this throwaway key and
// leave every other test of the run answered with a 401.

async function answerSyncAsEmpty(page: Page): Promise<void> {
  await page.route('**/api/sync/head', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"head":null}' }))
}

async function readPhrase(page: Page): Promise<string[]> {
  const words = page.getByTestId('phrase-words').locator('li .text')
  await expect(words).toHaveCount(12)
  return words.allTextContents()
}

test.describe('The first run creates a new vault', () => {
  test.beforeEach(async ({ page }) => {
    await answerSyncAsEmpty(page)
    await page.goto('/')
  })

  test('code, phrase, check and server — and the phrase is never at rest in the clear', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'ArxHub' })).toBeVisible()
    await page.getByTestId('entry-new-vault').click()

    await createCode(page)

    await expect(page.getByRole('heading', { name: 'Recovery phrase' })).toBeVisible()
    await expect(page.getByTestId('phrase-written')).toBeDisabled()
    await page.getByTestId('reveal-phrase').click()
    const words = await readPhrase(page)
    await page.getByTestId('phrase-written').click()

    await expect(page.getByRole('heading', { name: 'Check the phrase' })).toBeVisible()
    const questions = page.locator('[data-testid^="check-word-"]')
    await expect(questions).toHaveCount(3)
    const positions = (await questions.evaluateAll((all) => all.map((it) => it.getAttribute('data-testid')))).map((id) =>
      Number(id?.replace('check-word-', '')),
    )
    for (const position of positions) {
      const question = page.getByTestId(`check-word-${position}`)
      const answer = words[position - 1]
      const wrong = (await question.locator('.text').allTextContents()).find((word) => word !== answer) as string
      await question.getByText(wrong, { exact: true }).click()
      await expect(page.getByText('Not this word')).toBeVisible()
      await question.getByText(answer, { exact: true }).click()
    }
    await expect(page.getByText('Not this word')).toHaveCount(0)
    await page.getByTestId('check-next').click()

    await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible()
    // A browser bundle's server is the page's own origin, checked as soon as the screen is up.
    await expect(page.getByTestId('server-address')).toHaveText(new URL(page.url()).origin)
    await expect(page.getByTestId('server-status')).toHaveText('Server responds · vault is empty')
    // The vault of a browser bundle lives on that server, so a device-only vault is not offered.
    await expect(page.getByTestId('server-later')).toHaveCount(0)
    await page.getByTestId('server-connect').click()

    await expect(page.getByRole('heading', { name: 'Sync' })).toHaveCount(0)
    const stored = await page.evaluate(
      ([identity, verifier, entry]) => ({
        identity: localStorage.getItem(identity),
        verifier: localStorage.getItem(verifier),
        entry: localStorage.getItem(entry),
      }),
      [IDENTITY_KEY, VERIFIER_KEY, ENTRY_KEY] as const,
    )
    expect(stored.verifier).not.toBeNull()
    expect(stored.identity).not.toBeNull()
    for (const word of words) expect(stored.identity).not.toContain(word)
    // The first run is over: whatever sync has not yet consumed names the server, never a screen to resume.
    expect(JSON.parse(stored.entry ?? 'null')?.kind ?? 'connect').toBe('connect')
  })

  test('the check can be skipped', async ({ page }) => {
    await page.getByTestId('entry-new-vault').click()
    await createCode(page)
    await page.getByTestId('reveal-phrase').click()
    await page.getByTestId('phrase-written').click()

    await expect(page.getByTestId('check-next')).toBeDisabled()
    await page.getByTestId('skip-check').click()

    await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible()
  })

  test('a restart resumes at the screen the person had not finished, with the same phrase', async ({ page }) => {
    await page.getByTestId('entry-new-vault').click()
    await createCode(page)
    await page.getByTestId('reveal-phrase').click()
    const words = await readPhrase(page)

    await page.reload()

    // The code came first, so the next boot is an unlock — and after it, the phrase again, veiled.
    await expect(page.getByRole('heading', { name: 'ArxHub' })).toBeVisible()
    await enterCode(page, 'unlock-code', ENTRY_CODE)
    await expect(page.getByRole('heading', { name: 'Recovery phrase' })).toBeVisible()
    await expect(page.getByTestId('phrase-written')).toBeDisabled()
    await page.getByTestId('reveal-phrase').click()
    expect(await readPhrase(page)).toEqual(words)
  })
})
