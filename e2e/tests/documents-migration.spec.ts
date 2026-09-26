import { expect, test, typeKey, waitForApp } from './fixtures'

// A device that ran the build before Notes became Documents still holds the old names in its own
// storage. Updating must not cost it the open tabs, and a boot switch must follow the plugin's new name.
test('a desk saved under the Notes type reopens its tabs under Documents', async ({ app, vault }) => {
  const path = await vault.write('kept.md', 'still open after the update')
  await app.evaluate((key) => {
    localStorage.setItem(
      'arxhub.workspace',
      JSON.stringify({
        v: 1,
        workspace: {
          activeTypeId: 'arxhub.notes',
          types: [{ id: 'arxhub.notes', activeKey: key, tabs: [{ key, title: key, object: { path: key } }] }],
        },
        nav: {},
        column: {},
      }),
    )
    localStorage.setItem('arxhub.boot', JSON.stringify({ disabled: ['Notes'], maintenance: false }))
  }, path)
  await app.reload()
  await waitForApp(app)

  // The saved desk, not the editor on screen: which panel of the type is in front after a restore is the
  // frame's own decision (the phone may put Welcome there), while the restored tab is the migration's.
  await expect(typeKey(app, 'Documents')).toHaveAttribute('aria-pressed', 'true')

  const stored = await app.evaluate(() => ({
    workspace: JSON.parse(localStorage.getItem('arxhub.workspace') ?? '{}'),
    boot: JSON.parse(localStorage.getItem('arxhub.boot') ?? '{}'),
  }))
  const documents = stored.workspace.workspace.types.find((type: { id: string }) => type.id === 'arxhub.documents')
  expect(documents.tabs.map((tab: { key: string }) => tab.key)).toContain(path)
  expect(stored.workspace.workspace.types.map((type: { id: string }) => type.id)).not.toContain('arxhub.notes')
  expect(stored.boot.disabled).toEqual(['Documents'])

  await app.evaluate(() => localStorage.removeItem('arxhub.boot'))
})
