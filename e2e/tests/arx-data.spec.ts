import { closeSettings, openBlockSettings } from './arx-inspector-helpers'
import { expect, openNavigation, test } from './fixtures'

test('data blocks load tasks, open their sources and group documents by date in both frames', async ({ app, vault }) => {
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
  const view = app.getByRole('region', { name: 'Collection', exact: true })
  await expect(view.getByLabel('Data list')).toContainText('First indexed task', { timeout: 15000 })
  await openBlockSettings(app, view, 'Collection')
  await app.getByRole('button', { name: 'View', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Grouped', exact: true }).click()
  await closeSettings(app)
  await expect(view.getByLabel('Grouped results')).toContainText('Incomplete')
  await expect(view.getByLabel('Grouped results')).toContainText('Completed')
  await view.getByLabel('Grouped results').getByRole('button', { name: 'First indexed task', exact: true }).first().click()
  await expect(app.locator('.ProseMirror:visible')).toContainText('Second indexed task')
  await app.locator('.ProseMirror:visible').getByRole('checkbox').first().press('Space')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(async () => JSON.parse(await vault.read(tasks)).doc.content[0].content[0].attrs.checked).toBe(true)
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await openBlockSettings(app, view, 'Collection')
  await app.getByRole('button', { name: 'Source', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Documents', exact: true }).click()
  await app.getByRole('textbox', { name: 'Filter data', exact: true }).fill('')
  await app.getByRole('button', { name: 'View', exact: true }).click()
  await app.getByRole('menuitem', { name: 'By date', exact: true }).click()
  await closeSettings(app)
  await expect(view.getByLabel('Calendar month')).toBeVisible()
  await expect(view).toContainText('Dates show when documents were last modified.')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"layout": "calendar"')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Read only', exact: true }).click()
  await expect(app.getByRole('button', { name: 'Collection settings', exact: true })).toHaveCount(0)
  await expect(view.getByRole('button', { name: 'Refresh data', exact: true })).toBeEnabled()
})
