import { readFile } from 'node:fs/promises'
import { expect, openNavigation, test } from './fixtures'

test('publication exports standalone HTML and Markdown without publishing the source', async ({ app, vault }) => {
  const attachment = `attachments/export-${test.info().project.name}.txt`
  await vault.writeData(`vault/${attachment}`, 'Included attachment')
  const path = await vault.write(
    `${test.info().project.name}-export.arx`,
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Exported document' }] },
          {
            type: 'section',
            attrs: { title: 'Open section' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Section body' }] }],
          },
          { type: 'attachment', attrs: { path: attachment, name: 'Notes.txt', mime: 'text/plain' } },
        ],
      },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.locator('.ProseMirror:visible')).toContainText('Exported document')
  for (const format of ['HTML', 'Markdown']) {
    await app.getByRole('button', { name: 'Document tools', exact: true }).click()
    await expect(app.getByRole('menuitem', { name: 'Print / Save PDF', exact: true })).toBeEnabled()
    const pending = app.waitForEvent('download')
    await app.getByRole('menuitem', { name: `Export ${format}`, exact: true }).click()
    const download = await pending
    const file = await download.path()
    if (!file) throw new Error('Export must produce a downloadable file')
    const content = await readFile(file, 'utf8')
    expect(content).toContain('Exported document')
    expect(content).toContain('data:text/plain')
    if (format === 'HTML') {
      expect(download.suggestedFilename()).toMatch(/\.html$/)
      expect(content).toMatch(/<details[^>]* open>/)
      expect(content).toContain('@media print')
      expect(content).toContain('data:application/json;base64,')
    } else {
      expect(download.suggestedFilename()).toMatch(/\.md$/)
      expect(content).toContain('# Exported document')
    }
  }
})
