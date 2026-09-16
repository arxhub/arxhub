import { expect, isMobileFrame, openNavigation, test, waitForApp } from './fixtures'

test('malformed saved tabs do not prevent opening and using the vault', async ({ app, vault }) => {
  const path = await vault.write('recovered.md', 'still on disk')
  await app.evaluate(() => {
    localStorage.setItem(
      'arxhub.workspace',
      JSON.stringify({ v: 1, workspace: { activeTypeId: 'arxhub.notes', types: [{ id: 'arxhub.notes', tabs: {} }] } }),
    )
  })
  await app.reload()
  await waitForApp(app)
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.locator('.cm-content:visible')).toContainText('still on disk')
})

test('refresh rereads expanded descendants without collapsing the tree', async ({ app, vault }) => {
  const folder = `${test.info().project.name}-refresh`
  const oldPath = await vault.write(`${folder}/nested/old.md`, 'old')
  await app.reload()
  await openNavigation(app)
  const root = app.getByRole('treeitem', { name: oldPath.split('/')[0], exact: true })
  await root.click()
  const nested = app.getByRole('treeitem', { name: 'nested', exact: true })
  await nested.click()
  await expect(app.getByRole('treeitem', { name: 'old.md', exact: true })).toBeVisible()
  await vault.remove(oldPath)
  await vault.write(`${folder}/nested/new.md`, 'new')
  await app.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(app.getByRole('treeitem', { name: 'new.md', exact: true })).toBeVisible()
  await expect(app.getByRole('treeitem', { name: 'old.md', exact: true })).toHaveCount(0)
  await expect(root).toHaveAttribute('aria-expanded', 'true')
  await expect(nested).toHaveAttribute('aria-expanded', 'true')
})

test('action menu returns focus on dismissal and hands it to inline rename on selection', async ({ app, vault }) => {
  let path = await vault.write(`${test.info().project.name}-focus.md`, 'preserve content')
  await app.reload()
  await openNavigation(app)
  const mobile = await isMobileFrame(app)
  const input = app.getByRole('textbox', { name: 'New name', exact: true })
  for (let n = 0; n < 3; n++) {
    const row = app.getByRole('treeitem', { name: path, exact: true })
    await row.focus()
    await row.click({ button: 'right' })
    await expect(app.getByRole('menuitem', { name: 'Rename', exact: true })).toBeVisible()
    await app.keyboard.press('Escape')
    await expect(row).toBeFocused()
    await row.click({ button: 'right' })
    const rename = app.getByRole('menuitem', { name: 'Rename', exact: true })
    if (mobile) await rename.tap()
    else await rename.click()
    await expect(input).toBeFocused()
    const renamed = `${test.info().project.name}-renamed-${n}.md`
    // OR-03: '.md' is hidden in the row, so the field is typed — and read back — without it.
    await app.keyboard.type(renamed.replace('.md', ''), { delay: 40 })
    await expect(input).toHaveValue(renamed.replace('.md', ''))
    await expect(input).toBeFocused()
    await input.press('Enter')
    path = renamed
    await expect(app.getByRole('treeitem', { name: path, exact: true })).toBeVisible()
    expect(await vault.read(path)).toBe('preserve content')
  }
})
