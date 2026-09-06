import { expect, openNavigation, test } from './fixtures'

interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
}

// A half-written file is not a failure, it is "not yet" — expect.poll does not retry a callback that
// throws, so the parse has to answer null instead.
function parseOrNull(text: string): { version?: number; doc?: DocNode } | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// A-29: markdown deliberately stays flat, and this conversion is the ONE way a markdown note gets the
// structure the product reasons about. It is reached from the note itself, in the tree.
test.describe('converting a markdown note', () => {
  test('writes an .arx beside the original and leaves the original alone', async ({ app, vault }) => {
    const markdown = '# Title\n\n- [x] done\n- [ ] open\n'
    const path = await vault.write('convertible.md', markdown)
    await app.reload()
    await openNavigation(app)

    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Convert to .arx' }).click()

    const converted = path.replace(/\.md$/, '.arx')
    await expect.poll(() => vault.read(converted).then(parseOrNull, () => null)).toMatchObject({ version: 1, doc: { type: 'doc' } })

    // The structure is the whole point: `- [x]` becomes a task carrying its state, which is exactly
    // what the flat markdown reader cannot see.
    const blocks = parseOrNull(await vault.read(converted))?.doc?.content ?? []
    expect(blocks.map((node) => node.type)).toEqual(['heading', 'task_list'])
    expect((blocks[1].content ?? []).map((node) => node.attrs?.checked)).toEqual([true, false])

    // Converting ADDS a file. The markdown note is the owner's to keep or delete (A-1).
    expect(await vault.read(path)).toBe(markdown)
  })

  test('offers itself on markdown and nowhere else', async ({ app, vault }) => {
    const path = await vault.write('already.arx', JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }))
    await app.reload()
    await openNavigation(app)

    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await expect(app.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await expect(app.getByRole('menuitem', { name: 'Convert to .arx' })).toHaveCount(0)
  })
})
