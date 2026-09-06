import type { Locator, Page } from '@playwright/test'
import { expect, openSearchApp, test } from './fixtures'

// UJ-25 «Вопрос к базе на SQL»: the owner asks their own base a question in SQL and gets a table back,
// without being able to break anything doing it. Both halves matter — an answer, and a refusal that leaves
// the index and the console alike still working.

function panel(page: Page): Locator {
  return page.getByTestId('sql-console')
}

// From the Search rail, not from the page at large: on a phone the console's own tab is listed by the same
// name in the bottom bar once it is open, so an unscoped lookup would match two controls.
async function openConsole(page: Page): Promise<void> {
  await openSearchApp(page)
  await page.locator('.search-rail').getByRole('button', { name: 'SQL console' }).click()
  await expect(panel(page)).toBeVisible()
}

// CodeMirror's editable is a contenteditable, which fill() drives directly — no key-by-key typing, so a
// query with newlines in it lands in one step.
//
// Escape first, and the result checked afterwards, because of what fill() does to this particular control:
// it selects the element's text and inserts over the selection, and CodeMirror's completion popup — still
// open from the previous query, whose Run click had not yet blurred the editor — makes that select-all miss.
// The insert then lands at the cursor instead of over the old text, and the query that runs is the previous
// one with this one glued to its end: the DELETE that should have been refused as a write came back as
// "syntax error at or near FROM at character 124", one character past the select in front of it. Re-filling
// is what makes the step wait for a popup to close rather than for a fixed number of milliseconds.
async function writeQuery(page: Page, sql: string): Promise<void> {
  const editable = panel(page).locator('.cm-content')
  await expect(editable).toBeVisible()
  await expect
    .poll(
      async () => {
        await editable.press('Escape')
        await editable.fill(sql)
        return ((await editable.innerText()) ?? '').replace(/\s+/g, ' ').trim()
      },
      { message: 'the editor did not take the query' },
    )
    .toBe(sql.replace(/\s+/g, ' ').trim())
}

function runControl(page: Page): Locator {
  return panel(page).getByRole('button', { name: 'Run', exact: true })
}

// Clicks Run and waits for the query to finish. While one runs the control reads "Running…", so the name
// coming back is itself the signal — which is also the assertion that a second query cannot be sent over
// the first.
async function run(page: Page): Promise<void> {
  await runControl(page).click()
  await expect(runControl(page)).toBeEnabled()
}

function resultRows(page: Page): Locator {
  return panel(page).locator('.result-table tbody tr')
}

// The walk that fills the index starts at boot, so a note seeded after the app came up needs a reload — and
// the query may still beat the walk to that file. Re-running is what makes the step wait for the index
// rather than for a fixed number of seconds.
async function runUntil(page: Page, sql: string, atLeast: number): Promise<void> {
  await writeQuery(page, sql)
  await expect
    .poll(
      async () => {
        await run(page)
        return resultRows(page).count()
      },
      { timeout: 30_000, message: `the query never returned ${atLeast} rows` },
    )
    .toBeGreaterThanOrEqual(atLeast)
}

test.describe('asking the base a question in SQL', () => {
  test('a select answers with a table, a delete is refused, and the select still works after it', async ({ app, vault }) => {
    // Scoped to this test's own notes: the suite runs fully parallel over one vault, so a query over every
    // document would count rows another test is still writing.
    const first = await vault.write('notes/alpha.md', '# Альфа\n\nПервая заметка про носорога.\n')
    await vault.write('notes/beta.md', '# Бета\n\nВторая заметка, про кита.\n')
    const prefix = first.slice(0, first.indexOf('notes/'))
    await app.reload()

    await openConsole(app)

    const select = `SELECT path, title FROM document WHERE starts_with(path, '${prefix}') ORDER BY path`
    await runUntil(app, select, 2)

    // The field names come from the result itself, so the header is proof the fields[] side is wired.
    await expect(panel(app).locator('.result-table thead .field-name').first()).toHaveText('path')
    await expect(panel(app).locator('.result-table thead .field-name').nth(1)).toHaveText('title')
    await expect(resultRows(app).first()).toContainText('Альфа')
    // Row count and duration: what makes the answer readable as an answer.
    await expect(panel(app).locator('.summary')).toContainText(/rows? · \d+ ms/)

    const answered = await resultRows(app).count()
    expect(answered).toBeGreaterThanOrEqual(2)

    // A write is refused by the DBMS, not by a parser over the query text — the message is the DBMS' own.
    await writeQuery(app, `DELETE FROM document WHERE starts_with(path, '${prefix}')`)
    await run(app)
    await expect(app.getByTestId('sql-console-error')).toContainText(/read-only transaction/i)
    // The query text survives the refusal: it is something to fix in place, not to retype.
    await expect(panel(app).locator('.cm-content')).toContainText('DELETE FROM document')
    // And no table under the message, which would read as the refused query's own output.
    await expect(resultRows(app)).toHaveCount(0)

    // The rejection rolled its transaction back, so the connection is usable and every row is still there.
    // Without that ROLLBACK this is where everything after would die with "current transaction is aborted".
    await writeQuery(app, select)
    await run(app)
    await expect(app.getByTestId('sql-console-error')).toHaveCount(0)
    await expect(resultRows(app)).toHaveCount(answered)
    await expect(resultRows(app).first()).toContainText('Альфа')
  })

  test('the console says what the index is made of, so a query can be written without reading source', async ({ app }) => {
    await openConsole(app)

    const schema = panel(app).getByRole('region', { name: 'Index schema' })
    await expect(schema).toBeHidden()
    await panel(app).getByRole('button', { name: 'Schema' }).click()

    for (const table of ['document', 'block', 'ref', 'tag', 'index_meta']) {
      await expect(schema.getByRole('heading', { name: table, exact: true })).toBeVisible()
    }
    // Columns with their types, not just the table names.
    await expect(schema.getByText('title_fold', { exact: true })).toBeVisible()
    await expect(schema.getByText('tsvector', { exact: true }).first()).toBeVisible()
  })

  test('a query with a typo in it is answered, not swallowed, and stays in the editor', async ({ app }) => {
    await openConsole(app)

    await writeQuery(app, 'SELECT path FROM documnet')
    await run(app)

    await expect(app.getByTestId('sql-console-error')).toContainText(/documnet/)
    await expect(panel(app).locator('.cm-content')).toContainText('documnet')
    // Still the app, not a broken screen.
    await expect(app.getByRole('main')).toBeVisible()
  })

  test('a query that matches nothing is an empty state, not a failure', async ({ app }) => {
    await openConsole(app)

    await writeQuery(app, `SELECT path FROM document WHERE path = 'нет-такого-файла.md'`)
    await run(app)

    await expect(app.getByTestId('sql-console-empty')).toBeVisible()
    await expect(app.getByTestId('sql-console-error')).toHaveCount(0)
  })

  test('closing the console does not cost the query that was typed in it', async ({ app }) => {
    await openConsole(app)

    const typed = "SELECT count(*) FROM block WHERE type = 'heading'"
    await writeQuery(app, typed)

    // A reload throws the panel away for real, so what comes back can only have come from device storage.
    await app.reload()
    await openConsole(app)

    await expect(panel(app).locator('.cm-content')).toContainText(typed)
  })
})
