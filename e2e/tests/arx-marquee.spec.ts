import { expect, isMobileFrame, openNavigation, test } from './fixtures'

test('mouse marquee selects whole blocks, cancels and leaves text selection available', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'Mouse selection on the desktop frame')
  const path = await vault.write(
    'marquee.arx',
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: ['First paragraph', 'Second paragraph', 'Third paragraph'].map((text) => ({
          type: 'paragraph',
          content: [{ type: 'text', text }],
        })),
      },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  const first = await editor.locator('p').first().boundingBox()
  const second = await editor.locator('p').nth(1).boundingBox()
  const third = await editor.locator('p').nth(2).boundingBox()
  if (!first || !second || !third) throw new Error('Document blocks must be visible')
  const selected = editor.locator('.arx-block-selected')
  await app.mouse.move(first.x - 12, first.y + 2)
  await app.mouse.down()
  await app.mouse.move(second.x + 100, second.y + second.height - 2, { steps: 8 })
  await expect(app.locator('.arx-block-marquee')).toBeVisible()
  await expect(selected).toHaveText(['First paragraph', 'Second paragraph'])
  await app.mouse.up()
  await expect(app.locator('.arx-block-marquee')).toHaveCount(0)
  await app.getByRole('button', { name: 'Block actions', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Duplicate block', exact: true }).click()
  await expect(editor.locator('p')).toHaveText([
    'First paragraph',
    'Second paragraph',
    'First paragraph',
    'Second paragraph',
    'Third paragraph',
  ])
  await app.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(editor.locator('p')).toHaveCount(3)
  await app.mouse.move(third.x + third.width + 12, third.y + third.height - 2)
  await app.mouse.down()
  await app.mouse.move(second.x + 100, second.y + 2, { steps: 8 })
  await expect(selected).toHaveText(['Second paragraph', 'Third paragraph'])
  await app.keyboard.press('Escape')
  await app.mouse.up()
  await expect(selected).toHaveText(['First paragraph', 'Second paragraph'])
  await app.keyboard.down('Shift')
  await app.mouse.move(third.x + third.width + 12, third.y + third.height - 2)
  await app.mouse.down()
  await app.mouse.move(third.x + 100, third.y + 2, { steps: 8 })
  await app.mouse.up()
  await app.keyboard.up('Shift')
  await expect(selected).toHaveCount(3)
  await editor.locator('p').first().click()
  await expect(selected).toHaveCount(0)
  await app.mouse.move(first.x + 2, first.y + first.height / 2)
  await app.mouse.down()
  await app.mouse.move(first.x + 90, first.y + first.height / 2, { steps: 8 })
  await app.mouse.up()
  await expect.poll(() => app.evaluate(() => window.getSelection()?.toString())).not.toBe('')
  await expect(selected).toHaveCount(0)
  await expect(app.locator('.arx-block-marquee')).toHaveCount(0)
})

test('marquee follows autoscroll in long documents', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'Mouse selection on the desktop frame')
  const path = await vault.write(
    'marquee-scroll.arx',
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: Array.from({ length: 60 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Block ${i + 1}` }] })),
      },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  const scroller = app.locator('.editor-content:visible')
  const viewport = await scroller.boundingBox()
  const first = await editor.locator('p').first().boundingBox()
  if (!first || !viewport) throw new Error('Document must be visible')
  await app.mouse.move(first.x - 12, first.y + 2)
  await app.mouse.down()
  await app.mouse.move(first.x + 100, viewport.y + viewport.height - 8, { steps: 8 })
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(200)
  await app.mouse.up()
  const count = await editor.locator('.arx-block-selected').count()
  expect(count).toBeGreaterThan(10)
  await expect(editor.locator('.arx-block-selected').first()).toHaveText('Block 1')
  await app.keyboard.press('Backspace')
  await expect(editor.locator('p')).toHaveCount(60 - count)
  await app.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(editor.locator('p')).toHaveCount(60)
})

test('marquee selects opaque plugin blocks without editing their data and respects protected modes', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'Mouse selection on the desktop frame')
  const content = JSON.stringify({
    version: 1,
    doc: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before component' }] },
        { type: 'external_widget', attrs: { value: { nested: 42 } } },
        { type: 'paragraph', content: [{ type: 'text', text: 'After component' }] },
      ],
    },
  })
  const path = await vault.write('marquee-plugin.arx', content)
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  const first = await editor.locator(':scope > :first-child').boundingBox()
  const last = await editor.locator(':scope > :last-child').boundingBox()
  if (!first || !last) throw new Error('Document must be visible')
  async function drag() {
    if (!first || !last) return
    await app.mouse.move(first.x - 12, first.y + 2)
    await app.mouse.down()
    await app.mouse.move(last.x + 100, last.y + last.height - 2, { steps: 8 })
    await app.mouse.up()
  }
  await drag()
  await expect(editor.locator('.arx-block-selected')).toHaveCount(3)
  expect(await vault.read(path)).toBe(content)
  await app.keyboard.press('Escape')
  for (const mode of ['Read only', 'Interactive']) {
    await app.getByRole('button', { name: /^Editor mode:/ }).click()
    await app.getByRole('menuitem', { name: mode, exact: true }).click()
    await drag()
    await expect(editor.locator('.arx-block-selected')).toHaveCount(0)
    await expect(app.locator('.arx-block-marquee')).toHaveCount(0)
  }
  expect(await vault.read(path)).toBe(content)
})
