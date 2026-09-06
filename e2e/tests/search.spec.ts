import type { Locator, Page } from '@playwright/test'
import { expect, isMobileFrame, openMiniApp, openSearchApp as openSearch, test, waitForIndex } from './fixtures'

// UJ-24 «Поиск записи по слову из текста»: the owner remembers a word, not a file name. The path from that
// word to the open note has to work from the keyboard alone, and it has to end in the workspace the notes
// are already read in — not in a viewer of search's own.

function field(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Search' }).first()
}

function results(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Search results' })
}

// The index is filled by a walk that starts at boot, so a note seeded after the app came up needs a reload
// to be findable — and typing may still beat the walk to that file. Retyping is what makes the step wait for
// the index rather than for a fixed number of seconds.
async function searchFor(page: Page, term: string, expected: RegExp): Promise<void> {
  await expect
    .poll(
      async () => {
        await field(page).fill('')
        await field(page).fill(term)
        await page.waitForTimeout(400)
        return results(page).getByRole('option').filter({ hasText: expected }).count()
      },
      { timeout: 30_000, message: `nothing matching ${expected} was found for "${term}"` },
    )
    .toBeGreaterThan(0)
}

test.describe('finding a note by a word in its text', () => {
  test('a word from the body reaches the open document, keyboard only', async ({ app, vault }) => {
    const found = await vault.write('hit.md', '# Кит и носорог\n\nВ этом тексте встречается носорог, и это единственное место.\n')
    await vault.write('miss.md', '# Прочее\n\nЗдесь про других животных.\n')
    await app.reload()

    await openSearch(app)
    await searchFor(app, 'носорог', new RegExp(found))

    // The document row, then its snippets with the match emphasised. The highlight arrives as marks around
    // the match and is put on the page as text — the control characters themselves never show.
    await expect(results(app).locator('.snippet .match').first()).toHaveText(/носорог/i)
    // The marks the engine wraps a match in are STX/ETX: they tell the interface where to emphasise and must
    // never reach the text it draws. Built from char codes, because a literal control character in a source
    // file is invisible to whoever reads it next.
    const marks = [String.fromCharCode(2), String.fromCharCode(3)]
    const snippet = (await results(app).locator('.snippet').first().textContent()) ?? ''
    expect(marks.filter((mark) => snippet.includes(mark))).toEqual([])
    await expect(app.locator('.summary')).toContainText(/document/)

    // A result is a row of an enumeration, so it takes the frame's density and grows down from it because a
    // title carries its path (.claude/rules/design.md §Roles). Measured here rather than in design.spec: a
    // filled list needs the index to have caught up, which is what this test already waits for.
    const role = (await isMobileFrame(app)) ? '--size-xl' : '--size-2xs'
    const density = Number.parseFloat(
      await app.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), role),
    )
    const rows = await results(app)
      .getByRole('option')
      .evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().height)))
    expect(rows.length).toBeGreaterThan(0)
    for (const height of rows) expect(height).toBeGreaterThanOrEqual(density)

    // Down enters the list, down again moves inside it, Enter opens. Not a click in this path.
    await field(app).press('ArrowDown')
    await app.keyboard.press('ArrowDown')
    await expect(results(app)).toHaveAttribute('aria-activedescendant', /arxhub-search-result-/)
    await app.keyboard.press('Enter')

    await expect(app.locator('.cm-content:visible')).toContainText('носорог')

    // Opening the same result again activates the tab that is already there rather than adding another.
    await openSearch(app)
    await searchFor(app, 'носорог', new RegExp(found))
    const before = await app.locator('.cm-content').count()
    await results(app)
      .getByRole('option')
      .filter({ hasText: new RegExp(found) })
      .first()
      .click()
    await expect(app.locator('.cm-content:visible')).toContainText('носорог')
    expect(await app.locator('.cm-content').count()).toBe(before)
  })

  test('escape gives up the search and puts the cursor back in the field', async ({ app, vault }) => {
    const path = await vault.write('escape.md', '# Отмена\n\nСлово бегемот стоит в тексте.\n')
    await app.reload()

    await openSearch(app)
    await searchFor(app, 'бегемот', new RegExp(path))
    await field(app).press('ArrowDown')
    await app.keyboard.press('Escape')

    await expect(field(app)).toHaveValue('')
    await expect(field(app)).toBeFocused()
  })

  test('a note that spells out markup keeps it as text', async ({ app, vault }) => {
    const path = await vault.write('markupish.md', '# Разметка\n\nВ заметке написано <b>жираф</b> прямо так.\n')
    await app.reload()

    await openSearch(app)
    await searchFor(app, 'жираф', new RegExp(path))

    // Nothing from a note becomes part of the page: the snippet is a row of text spans, and the only element
    // in it is the app's own emphasis on the match.
    await expect(results(app).locator('.snippet b')).toHaveCount(0)
    await expect(results(app).locator('.snippet i')).toHaveCount(0)
    await expect(app.locator('.search-rail')).toContainText('жираф')
  })

  test('the toggles change the answer and outlive the mini-app', async ({ app, vault }) => {
    const body = await vault.write('body-only.md', '# Совсем другое\n\nСлово зебра есть только в тексте.\n')
    await app.reload()

    await openSearch(app)
    await searchFor(app, 'зебра', new RegExp(body))

    // Narrowing to titles drops a document the word is only in the body of. The switch's own input is
    // visually hidden, so the click goes to the control the owner presses.
    await app.getByTestId('search-toggle-titles-only').click()
    await expect(
      results(app)
        .getByRole('option')
        .filter({ hasText: new RegExp(body) }),
    ).toHaveCount(0)

    // Leaving the mini-app and coming back finds the switch as it was left: the setting is device-local and
    // does not live in the component that showed it. Where "away" is differs by frame: on a phone Search IS
    // a section of Explorer's rail, so Explorer is not away at all — and on the desktop Settings is not
    // usable as "away" either, since its section list holds a row called Search too.
    await openMiniApp(app, (await isMobileFrame(app)) ? 'Settings' : 'Explorer')
    await openSearch(app)
    await expect(app.getByRole('checkbox', { name: 'Titles only' })).toBeChecked()

    // Left as found, so the next test starts from the defaults.
    await app.getByTestId('search-toggle-titles-only').click()
    await expect(app.getByRole('checkbox', { name: 'Titles only' })).not.toBeChecked()
  })

  test('an expression that does not parse is said so, and the list stays', async ({ app, vault }) => {
    const path = await vault.write('regex.md', '# Регулярное\n\nтекст с носорогом\n')
    await app.reload()

    await openSearch(app)
    await searchFor(app, 'носорог', new RegExp(path))

    await app.getByTestId('search-toggle-regex').click()
    await field(app).fill('(носорог')

    await expect(app.locator('.message.danger')).toContainText('not a valid regular expression')
    // The previous list is still there — an empty one would have read as "nothing matches".
    await expect(results(app).getByRole('option').first()).toBeVisible()

    await app.getByTestId('search-toggle-regex').click()
    await expect(app.locator('.message.danger')).toHaveCount(0)
  })

  test('a found document nothing can open says so instead of doing nothing', async ({ app, vault }) => {
    // '.text' is indexed as prose and claimed by no panel, which is exactly the case the notification is for.
    const path = await vault.write('unopenable.text', 'слово бегемот в файле, который ни одна панель не заявляет\n')
    await app.reload()

    await openSearch(app)
    await searchFor(app, 'бегемот', new RegExp(path))
    await results(app)
      .getByRole('option')
      .filter({ hasText: new RegExp(path) })
      .first()
      .click()

    await expect(app.getByText('Nothing can open this file')).toBeVisible()
    // Still the app, not a broken screen.
    await expect(app.getByRole('main')).toBeVisible()
  })

  test('an empty answer says what was searched', async ({ app }) => {
    await openSearch(app)
    await field(app).fill('птеродактиль-которого-нет')

    await expect(app.locator('.empty')).toContainText('птеродактиль-которого-нет')
  })

  test('the index says what it holds, in both frames, and rebuilds on request', async ({ app }) => {
    await openSearch(app)

    // Either the walk is running or it has finished; both are a statement about the index, and neither is
    // "nothing found".
    await expect(app.locator('.index-state-text')).toContainText(/in index|Indexing…/)

    const reindex = app.getByRole('button', { name: 'Reindex' })
    // A walk in progress leaves the control inert — including the very first one, which is still running a
    // second into the session — so the rebuild is asked for once the index reports what it holds.
    await waitForIndex(app)
    await expect(reindex).toBeEnabled()
    await reindex.click()
    // The rebuild is a second walk of the whole vault, and the control stays inert for all of it — so this
    // is the wait for the walk itself, not for a paint. Not keyed on the status line: it goes back to
    // reading 'N in index' the moment the walk ends, but the count it held BEFORE the click reads the same,
    // so a line-watcher passes without having waited for anything.
    await expect(reindex).toBeEnabled({ timeout: 20_000 })
    await expect(app.locator('.index-state-text')).toContainText('in index')
  })
})
