import type { Locator, Page } from '@playwright/test'
import {
  expect,
  isMobileFrame,
  openMiniApp,
  openNote,
  openRailSection,
  openSearchApp as openSearch,
  test,
  waitForApp,
  waitForIndex,
} from './fixtures'

// UJ-24 «Поиск записи по слову из текста»: the owner remembers a word, not a file name. The path from that
// word to the open note has to work from the keyboard alone, and it has to end in the workspace the notes
// are already read in — not in a viewer of search's own.

function field(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Search' }).first()
}

function results(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Search results' })
}

// One document of the answer, found by the path it carries. A document row prints the path under the
// title; the snippet rows under it print note text only, so this picks the one row that stands for the
// document rather than the whole group.
function documentRow(page: Page, path: string): Locator {
  return results(page)
    .getByRole('option')
    .filter({ hasText: new RegExp(path) })
}

// How many documents the rail says it found — the number the owner reads, not a tally of rows. Counting
// options would count the snippets too, and a note with three matches would then look like three answers.
async function documentCount(page: Page): Promise<number> {
  const text = (await page.locator('.summary').textContent()) ?? ''
  const found = /(\d+)\s+document/.exec(text)
  return found == null ? -1 : Number(found[1])
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
    await waitForApp(app)
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

  // UJ-24 step 1, the live half: everything above seeds the vault behind the app's back and reloads, which
  // fills the index through the boot walk. Nothing exercised the path a save actually takes —
  // VaultWatcher → IndexQueue → Indexer — so an app that quietly stopped observing the vault left every
  // other test in this file green. There is no reload between the save and the search below, deliberately.
  test('a note saved in the editor is found without a reload, and gone once deleted', async ({ app, vault }) => {
    // The two projects share one vault, and this test DELETES what it seeded: a path both would write and
    // one would remove is a race, so the frame's own name goes into the file names. The word may be shared
    // — every assertion below names a path, so the other frame's copy is never an answer to this one.
    const frame = test.info().project.name
    // A second note that carries the word from the start. It is what tells a list that lost the deleted
    // note apart from a search that stopped answering at all.
    const control = await vault.write(`${frame}-control.md`, '# Контроль\n\nСлово трилобит уже лежало здесь.\n')
    const live = await vault.write(`${frame}-live.md`, '# Живая заметка\n\nПока здесь только окаменелость.\n')

    // The reload is here and nowhere later: the boot walk indexes this note WITHOUT the word, so the index
    // starts out unable to answer for it.
    await openNote(app, live)
    const mobile = await isMobileFrame(app)
    // And the walk has to be OVER before the word is typed — the status line says "N in index" only once it
    // is. A walk still in flight would reach this file by itself and index the saved bytes, which would let
    // the search below pass with nothing observing anything.
    await openSearch(app)

    // What the index holds about this note before anything is typed, in two halves. The walk really covered
    // it — a word from the bytes on disk finds it — and the word this test is about is not an answer for it
    // yet, while the same query does answer for the control note. Without this, a later hit would be
    // explicable by a walk that had simply not got here yet.
    await searchFor(app, 'окаменелость', new RegExp(live))
    await field(app).fill('трилобит')
    await expect
      .poll(async () => ({ live: await documentRow(app, live).count(), control: await documentRow(app, control).count() }), {
        message: 'the word was already an answer for the note it has not been typed into yet',
      })
      .toEqual({ live: 0, control: 1 })

    // On the desktop the rail sits beside the editor, so there is nothing to move out of the way. On a
    // phone the rail IS the panel over the note, and the Save button is underneath it.
    if (mobile) {
      await app.getByRole('button', { name: 'Close navigation' }).click()
      await expect(app.getByRole('region', { name: /navigation$/ })).toBeHidden()
    }

    await app.locator('.cm-content:visible .cm-line').last().click()
    await app.keyboard.press('End')
    await app.keyboard.type(' трилобит')
    await expect(app.locator('.cm-content:visible')).toContainText('трилобит')
    // Exact: the workspace tab beside it is named after the file, and this test's own name has "saved" in
    // it — a substring match would find two buttons.
    await app.getByRole('button', { name: 'Save', exact: true }).click()
    // The write reached the vault. The freshness path starts at a write, so a save that never happened
    // would make everything below prove nothing.
    await expect.poll(() => vault.read(live)).toContain('трилобит')

    // Still the same running app. The walk is finished and nothing re-walks on its own, so the only way
    // this document can answer is the observation path picking the save up while the session is up.
    if (mobile) await openRailSection(app, 'Search')
    await searchFor(app, 'трилобит', new RegExp(live))

    // Deleted through the app, not behind its back: the watcher wraps the vault view every writer goes
    // through, and a bare unlink on disk is not a write the app ever made.
    if (mobile) await openRailSection(app, 'Files')
    else await openMiniApp(app, 'Explorer')
    await app.getByRole('treeitem', { name: live }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Delete' }).click()
    await app.getByRole('button', { name: 'Delete', exact: true }).last().click()
    await expect.poll(() => vault.read(live).catch(() => null)).toBeNull()

    if (mobile) await openRailSection(app, 'Search')
    else await openSearch(app)
    // The same question as before, asked until the deleted note is no longer among the answers. Paired
    // with the control note, which must still be found: an empty list would say "gone" just as loudly if
    // search had stopped working altogether.
    await expect
      .poll(
        async () => {
          await field(app).fill('')
          await field(app).fill('трилобит')
          return { deleted: await documentRow(app, live).count(), kept: await documentRow(app, control).count() }
        },
        { timeout: 30_000, message: 'the deleted note kept answering, or the control note stopped' },
      )
      .toEqual({ deleted: 0, kept: 1 })
  })

  // UJ-24 step 2: the qualifiers were typed by no test at all, so the whole `title:`/`path:`/`tag:`/`ext:`/
  // `in:` half of FR-231 rested on unit tests. Seeded so the narrowing is unambiguous — the word is in the
  // body of four notes and in the heading of exactly one of them.
  test('a title qualifier narrows the list to what it names', async ({ app, vault }) => {
    // Both projects seed the same bytes at the same paths, the way the rest of this file does: nothing here
    // deletes anything, so the two runs cannot tidy up under each other.
    const bodies = [
      await vault.write('rock-1.md', '# Порода первая\n\nВ этом абзаце встречается кварцит.\n'),
      await vault.write('rock-2.md', '# Порода вторая\n\nИ здесь тоже кварцит.\n'),
      await vault.write('rock-3.md', '# Порода третья\n\nКварцит снова в тексте.\n'),
    ]
    const titled = await vault.write('rock-summary.md', '# Конспект про кварцит\n\nЗаголовок называет кварцит.\n')
    await app.reload()

    await openSearch(app)
    await searchFor(app, 'кварцит', new RegExp(titled))
    // The walk lands a batch at a time, so the other three may arrive after the first answer. Asking the
    // same question again is what waits for them — the count below is only meaningful once all four are in.
    await expect
      .poll(
        async () => {
          await field(app).fill('')
          await field(app).fill('кварцит')
          return Promise.all([...bodies, titled].map((path) => documentRow(app, path).count()))
        },
        { timeout: 30_000, message: 'not every seeded note answered the bare word' },
      )
      .toEqual([1, 1, 1, 1])
    const broad = await documentCount(app)
    expect(broad).toBeGreaterThanOrEqual(4)

    // The same word with a qualifier naming the OTHER three headings — deliberately not the one the free
    // text already favours. `title:конспект` would read as a passing test even with qualifier parsing
    // torn out, because that word is in the summary's own heading and the fuzzy-title branch alone picks
    // it: the answer would be identical for the wrong reason. `title:порода` cannot be reached that way —
    // ignore the qualifier and the query matches nothing at all.
    await field(app).fill('кварцит title:порода')
    await expect
      .poll(
        async () => ({
          titled: await documentRow(app, titled).count(),
          bodies: (await Promise.all(bodies.map((path) => documentRow(app, path).count()))).reduce((sum, count) => sum + count, 0),
        }),
        { message: 'title: did not narrow to the notes whose heading names it' },
      )
      .toEqual({ titled: 0, bodies: 3 })

    // Strictly shorter, read off the count the rail shows rather than inferred from the rows above: the
    // qualifier has to narrow the answer, not merely reorder it.
    const narrowed = await documentCount(app)
    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(broad)
  })
})
