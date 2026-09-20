import { expect, openNavigation, test } from './fixtures'

// The merged form a sync round would have written (see plugins/editor/src/arx-merge.ts and
// packages/sync/src/repo.ts's content merger) — seeded directly, because this spec is about resolving
// a conflict already in a document, not about running a real two-device sync.
const conflictDocument = JSON.stringify({
  version: 1,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'conflict',
        attrs: { kind: 'edit-edit' },
        content: [
          {
            type: 'conflict_side',
            attrs: { side: 'local' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Local text' }] }],
          },
          {
            type: 'conflict_side',
            attrs: { side: 'remote' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remote text' }] }],
          },
        ],
      },
    ],
  },
})

test('a conflict block is resolved in place, and Undo brings it back', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-conflict.arx`, conflictDocument)
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()

  const editor = app.locator('.ProseMirror:visible')
  await expect(editor).toBeVisible()
  const box = editor.locator('.conflict-block')
  await expect(box).toBeVisible()
  await expect(box).toContainText('Local text')
  await expect(box).toContainText('Remote text')
  await expect(app.locator('.editor-warning')).toContainText('1 unresolved conflict')

  await box.getByRole('button', { name: "Keep other device's", exact: true }).click()

  // Resolved to the remote side, the conflict node gone from the live document and the status line.
  await expect(editor.locator('.conflict-block')).toHaveCount(0)
  await expect(editor).toContainText('Remote text')
  await expect(editor).not.toContainText('Local text')
  await expect(app.locator('.editor-warning')).toHaveCount(0)

  // Autosave writes the resolution to disk — no conflict node left in the file either. Polled on the
  // conflict node's own absence, not on "Remote text" alone: that substring is already in the
  // UNRESOLVED file (inside the conflict block), so it would pass before autosave ever ran.
  await expect.poll(() => vault.read(path)).not.toContain('"type":"conflict"')
  const written = await vault.read(path)
  expect(written).toContain('Remote text')
  expect(written).not.toContain('Local text')

  // Undo is one ordinary transaction away, exactly like any other edit.
  await app.keyboard.press('ControlOrMeta+z')
  await expect(editor.locator('.conflict-block')).toBeVisible()
  await expect(app.locator('.editor-warning')).toContainText('1 unresolved conflict')
})
