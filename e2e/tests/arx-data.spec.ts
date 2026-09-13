import { expect, openNavigation, test } from './fixtures'

test('data blocks load tasks, open their sources and offer document calendars in both frames', async ({ app, vault }) => {
  const tasks = await vault.write(
    `${test.info().project.name}-tasks.arx`,
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'task_list',
            content: ['First indexed task', 'Second indexed task'].map((text, i) => ({
              type: 'task_item',
              attrs: { checked: i > 0 },
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            })),
          },
        ],
      },
    }),
  )
  const path = await vault.write(
    `${test.info().project.name}-data.arx`,
    JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: [{ type: 'data_view', attrs: { source: 'tasks', layout: 'list', query: tasks } }] },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const view = app.getByRole('region', { name: 'Data view', exact: true })
  await expect(view.getByLabel('Data list')).toContainText('First indexed task', { timeout: 15000 })
  await view.getByRole('button', { name: 'list', exact: true }).click()
  await app.getByRole('menuitem', { name: 'board', exact: true }).click()
  await expect(view.getByLabel('Data board')).toContainText('Incomplete')
  await expect(view.getByLabel('Data board')).toContainText('Completed')
  await view.getByLabel('Data board').getByRole('button', { name: 'First indexed task', exact: true }).first().click()
  await expect(app.locator('.ProseMirror:visible')).toContainText('Second indexed task')
  await app.locator('.ProseMirror:visible').getByRole('checkbox').first().press('Space')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(async () => JSON.parse(await vault.read(tasks)).doc.content[0].content[0].attrs.checked).toBe(true)
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await view.getByRole('button', { name: 'Tasks', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Documents', exact: true }).click()
  await view.getByRole('textbox', { name: 'Filter data', exact: true }).fill('')
  await view.getByRole('button', { name: 'list', exact: true }).click()
  await app.getByRole('menuitem', { name: 'calendar', exact: true }).click()
  await expect(view.getByLabel('Calendar month')).toBeVisible()
  await expect(view).toContainText('Dates show when documents were last modified.')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"layout": "calendar"')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Read only', exact: true }).click()
  await expect(view.getByRole('button', { name: 'Documents', exact: true })).toBeDisabled()
  await expect(view.getByRole('button', { name: 'Refresh data', exact: true })).toBeEnabled()
})
