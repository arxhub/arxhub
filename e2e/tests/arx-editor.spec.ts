import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const document = (content: unknown[]) => JSON.stringify({ version: 1, doc: { type: 'doc', content } })
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

async function openArx(app: Page, path: string) {
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.locator('.ProseMirror:visible')).toBeVisible()
  return app.locator('.ProseMirror:visible')
}

async function mode(app: Page, label: string) {
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: label, exact: true }).click()
  await expect(app.getByRole('menu', { name: 'Document tools' })).toBeHidden()
}

test('arx modes preserve text while saving control values', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-modes.arx`,
    document([
      paragraph('Original text'),
      { type: 'task_list', content: [{ type: 'task_item', attrs: { checked: false }, content: [paragraph('Ship the editor')] }] },
      { type: 'select', attrs: { label: 'Priority', options: ['Low', 'High'], value: 'Low' } },
    ]),
  )
  const editor = await openArx(app, path)
  await editor.locator('p').first().click()
  await app.keyboard.press('End')
  await app.keyboard.insertText(' unsaved')
  await mode(app, 'Interactive')
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await expect(app.getByRole('toolbar', { name: 'Formatting' })).toHaveCount(0)
  await expect(app.getByRole('button', { name: 'Configure', exact: true })).toHaveCount(0)
  await editor.locator('p').first().click()
  await app.keyboard.press('ControlOrMeta+z')
  await app.keyboard.insertText('/forbidden')
  await app.keyboard.press('Backspace')
  await expect(editor.locator('p').first()).toHaveText('Original text unsaved')
  const checkbox = editor.getByRole('checkbox')
  await editor.locator('[data-scope="checkbox"][data-part="control"]').click()
  await expect(checkbox).toBeChecked()
  await editor.getByRole('button', { name: 'Priority', exact: true }).click()
  await app.getByRole('menuitem', { name: 'High', exact: true }).click()
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"value": "High"')
  expect(await vault.read(path)).toContain('"checked": true')
  expect(await vault.read(path)).toContain('Original text unsaved')
  await mode(app, 'Read only')
  await expect(checkbox).toBeDisabled()
  await expect(editor.getByRole('button', { name: 'Priority', exact: true })).toBeDisabled()
  await expect(app.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await mode(app, 'Editable')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(checkbox).toBeChecked()
  await expect(editor.getByRole('button', { name: 'Priority', exact: true })).toHaveText('High')
  await openArx(app, path)
  await expect(editor.getByRole('checkbox')).toBeChecked()
  await expect(editor.getByRole('button', { name: 'Priority', exact: true })).toHaveText('High')
})

test('slash builds tasks and a configurable dropdown with keyboard and pointer', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-slash.arx`, document([{ type: 'paragraph' }]))
  const editor = await openArx(app, path)
  await editor.click()
  await app.keyboard.insertText('/task')
  await expect(app.getByRole('listbox', { name: 'Insert block' })).toBeVisible()
  await app.keyboard.press('Enter')
  await app.keyboard.insertText('First task')
  await app.keyboard.press('Enter')
  await app.keyboard.insertText('Second task')
  await app.keyboard.press('Enter')
  await app.keyboard.press('Enter')
  await expect(editor.getByRole('checkbox')).toHaveCount(2)
  await app.keyboard.insertText('/drop')
  await app.getByRole('option', { name: 'Dropdown', exact: true }).click()
  await editor.getByRole('button', { name: 'Configure', exact: true }).click()
  await app.getByRole('textbox', { name: 'Dropdown label', exact: true }).fill('Stage')
  await app.getByRole('textbox', { name: 'Dropdown options', exact: true }).fill('Draft\nReview\nPublished')
  await app.getByRole('button', { name: 'Apply', exact: true }).click()
  await mode(app, 'Interactive')
  await editor.getByRole('button', { name: 'Stage', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Review', exact: true }).click()
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  // A freshly configured option is stored by an id of its own, and the value names that id.
  await expect.poll(() => vault.read(path)).toContain('"label": "Review"')
  const saved = await vault.read(path)
  const select = JSON.parse(saved).doc.content.find((node: { type: string }) => node.type === 'select')
  expect(select.attrs.options.map((option: { label: string }) => option.label)).toEqual(['Draft', 'Review', 'Published'])
  expect(select.attrs.value).toBe(select.attrs.options[1].id)
  expect(saved).toContain('First task')
  expect(saved).toContain('Second task')
  expect(saved).not.toContain('/task')
  expect(saved).not.toContain('/drop')
})

test('a slash in a line that keeps its text puts the block after it, and a task keeps its list', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-slash-placement.arx`,
    document([
      paragraph('Keep this line'),
      { type: 'task_list', content: [{ type: 'task_item', attrs: { checked: false }, content: [paragraph('Task text')] }] },
    ]),
  )
  const editor = await openArx(app, path)
  await editor.locator(':scope > p').first().click()
  await app.keyboard.press('Home')
  await app.keyboard.insertText('/drop')
  await app.getByRole('option', { name: 'Dropdown', exact: true }).click()
  await expect(editor.locator(':scope > p').first()).toHaveText('Keep this line')
  await expect(editor.locator(':scope > *').nth(1)).toHaveAttribute('data-type', 'select')
  await app.keyboard.insertText('after the dropdown')
  await expect(editor.locator(':scope > p').nth(1)).toHaveText('after the dropdown')

  // The same slash inside a task: the item's first child must stay a paragraph, so the block lands
  // after it rather than in its place — the list is still one list of one task.
  await editor.locator('li[data-type="task_item"] p').click()
  await app.keyboard.press('Home')
  await app.keyboard.insertText('/drop')
  await app.getByRole('option', { name: 'Dropdown', exact: true }).click()
  await expect(editor.locator('ul[data-type="task_list"]')).toHaveCount(1)
  await expect(editor.locator('li[data-type="task_item"]')).toHaveCount(1)
  await expect(editor.locator('li[data-type="task_item"] [data-type="select"]')).toHaveCount(1)
  await expect(editor.locator('li[data-type="task_item"] p').first()).toHaveText('Task text')
  await app.keyboard.insertText('inside the task')
  await expect(editor.locator('li[data-type="task_item"] p').last()).toHaveText('inside the task')
})

test('interactive mode undoes and redoes a value it just changed', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-interactive-undo.arx`,
    document([
      paragraph('Protected text'),
      { type: 'task_list', content: [{ type: 'task_item', attrs: { checked: false }, content: [paragraph('Tick me')] }] },
    ]),
  )
  const editor = await openArx(app, path)
  await mode(app, 'Interactive')
  const checkbox = editor.getByRole('checkbox')
  await editor.locator('[data-scope="checkbox"][data-part="control"]').click()
  await expect(checkbox).toBeChecked()
  // From where ticking the box left the focus — inside the checkbox's own component — and not through
  // ProseMirror, which never sees a keydown while the view is not editable.
  await app.keyboard.press('ControlOrMeta+z')
  await expect(checkbox).not.toBeChecked()
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Redo', exact: true }).click()
  await expect(checkbox).toBeChecked()
  await expect(editor.locator('p').first()).toHaveText('Protected text')
})

test('Enter in the middle of a finished task starts an unfinished one', async ({ app, vault }) => {
  // Not on the mobile frame: its device is an Android one, and prosemirror-view drops the Enter keydown
  // outright on Chrome for Android (the key arrives inside a composition sequence there), leaving the
  // split to the browser and a re-parse. What that asserts is the emulated browser, not the editor.
  test.skip(await isMobileFrame(app), 'prosemirror-view hands Enter to the composition path on Android')
  const path = await vault.write(
    `${test.info().project.name}-split-task.arx`,
    document([{ type: 'task_list', content: [{ type: 'task_item', attrs: { checked: true }, content: [paragraph('ne')] }] }]),
  )
  const editor = await openArx(app, path)
  await editor.locator('li[data-type="task_item"] p').click()
  // Typed rather than arrowed into place: an arrow key moves the caret in the browser, which only does
  // that while the page holds focus — and two specs of one project run in two pages at once.
  await app.keyboard.press('Home')
  await app.keyboard.insertText('Do')
  await expect(editor.locator('li[data-type="task_item"] p')).toHaveText('Done')
  await app.keyboard.press('Enter')
  await expect(editor.locator('li[data-type="task_item"]')).toHaveCount(2)
  await expect(editor.locator('li[data-checked="true"] p')).toHaveText('Do')
  await expect(editor.locator('li[data-checked="false"] p')).toHaveText('ne')
})

test('a space keeps the slash menu open, and the insert hint follows the caret', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-slash-space.arx`,
    document([paragraph('Some text'), { type: 'paragraph' }, { type: 'paragraph' }]),
  )
  const editor = await openArx(app, path)
  await expect(editor.locator('p[data-placeholder]')).toHaveCount(0)
  await editor.locator('p').nth(1).click()
  // The hint is on the empty paragraph the caret is in, not on every empty one.
  await expect(editor.locator('p[data-placeholder]')).toHaveCount(1)
  await expect(editor.locator('p').nth(1)).toHaveAttribute('data-placeholder', 'Type / to insert a block')
  await app.keyboard.insertText('/heading 2')
  const menu = app.getByRole('listbox', { name: 'Insert block' })
  await expect(menu.getByRole('option')).toHaveText(['Heading 2'])
  await app.keyboard.press('Enter')
  await expect(editor.locator('h2')).toHaveCount(1)
  // A sentence that only happens to start with a slash lets the menu go.
  await editor.locator('p').nth(1).click()
  await app.keyboard.insertText('/hello world')
  await expect(menu).toHaveCount(0)
  await expect(editor.locator('p').nth(1)).toHaveText('/hello world')
})

async function formatting(app: Page, label: string) {
  if (label === 'Undo') {
    await app.getByRole('button', { name: 'Document tools', exact: true }).click()
    await app.getByRole('menuitem', { name: 'Undo', exact: true }).click()
    return
  }
  if (label === 'Current block' || label === 'Indent list item') {
    await app.getByRole('button', { name: 'Block actions', exact: true }).click()
    if (label !== 'Current block') await app.getByRole('menuitem', { name: label, exact: true }).click()
    return
  }
  const more = app.getByRole('button', { name: 'More formatting', exact: true })
  if (await isMobileFrame(app)) {
    await more.click()
    await app.getByRole('menuitem', { name: label, exact: true }).click()
  } else {
    await app.getByRole('button', { name: label, exact: true }).click()
  }
}

test('touch insertion and block actions preserve neighboring content and undo', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-blocks.arx`, document([paragraph('First'), paragraph('Second')]))
  const editor = await openArx(app, path)
  await editor.locator('p').first().click()
  await app.getByRole('button', { name: 'Insert block', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Dropdown', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Status', exact: true })).toBeVisible()
  await expect(editor.locator('p').first()).toHaveText('First')
  await expect(editor.locator('p').last()).toHaveText('Second')
  await editor.getByRole('button', { name: 'Status', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Done', exact: true }).click()
  await app.getByRole('button', { name: 'Block actions', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Duplicate block', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Status', exact: true })).toHaveCount(2)
  await formatting(app, 'Undo')
  await expect(editor.getByRole('button', { name: 'Status', exact: true })).toHaveCount(1)
  await editor.locator('p').last().click()
  await formatting(app, 'Current block')
  await app.getByRole('menuitem', { name: 'Duplicate block', exact: true }).click()
  await expect(editor.locator('p').filter({ hasText: /^Second$/ })).toHaveCount(2)
  await formatting(app, 'Undo')
  await expect(editor.locator('p').filter({ hasText: /^Second$/ })).toHaveCount(1)
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect(app.locator('.editor-status')).toContainText('Saved')
  await expect.poll(() => vault.read(path)).toContain('"type": "select"')
})

test('unknown plugin blocks survive edits to surrounding content', async ({ app, vault }) => {
  const original = document([{ type: 'missing_plugin_block', attrs: { payload: 'Keep this data' } }, paragraph('Neighbor')])
  const path = await vault.write(`${test.info().project.name}-unsupported.arx`, original)
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.locator('.unknown-block')).toContainText('missing_plugin_block')
  await app.locator('.ProseMirror > p').click()
  await app.keyboard.press('End')
  await app.keyboard.insertText(' edited')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('Neighbor edited')
  expect(JSON.parse(await vault.read(path)).doc.content[0]).toEqual({
    type: 'missing_plugin_block',
    attrs: { payload: 'Keep this data', arxId: expect.any(String) },
  })
  await app.reload()
  await expect(app.locator('.unknown-block')).toContainText('missing_plugin_block')
})

test('block handle and link editing work without losing the text selection', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-links.arx`, document([paragraph('Useful words'), paragraph('Second')]))
  const editor = await openArx(app, path)
  await editor.locator('p').first().click()
  await app.keyboard.press('Home')
  await app.keyboard.down('Shift')
  await app.keyboard.press('End')
  await app.keyboard.up('Shift')
  await formatting(app, 'Link')
  const dialog = app.getByRole('dialog', { name: 'Link', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Link address' }).fill('https://example.com')
  await dialog.getByRole('button', { name: 'Apply link', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(editor.getByRole('link', { name: 'Useful words' })).toHaveAttribute('href', 'https://example.com')
  await editor.locator('p').last().click()
  await app.getByRole('button', { name: 'Block actions', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Move block up', exact: true }).click()
  await expect(editor.locator('p').first()).toHaveText('Second')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('https://example.com')
})

test('nested tasks keep their structure and checked values through copy and paste', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-clipboard.arx`,
    document([
      {
        type: 'task_list',
        content: [
          { type: 'task_item', attrs: { checked: true }, content: [paragraph('Parent task')] },
          { type: 'task_item', attrs: { checked: false }, content: [paragraph('Child task')] },
        ],
      },
      { type: 'paragraph' },
    ]),
  )
  const editor = await openArx(app, path)
  await editor.locator('p').filter({ hasText: 'Child task' }).click()
  await formatting(app, 'Indent list item')
  await expect(editor.locator('ul[data-type="task_list"] ul[data-type="task_list"]')).toHaveCount(1)
  await editor.focus()
  await app.keyboard.press('ControlOrMeta+a')
  const copied = await editor.evaluate((element) => {
    const clipboardData = new DataTransfer()
    element.dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }))
    return { html: clipboardData.getData('text/html'), text: clipboardData.getData('text/plain') }
  })
  expect(copied.html).toContain('data-checked="true"')
  expect(copied.text).toContain('Child task')
  await editor.locator(':scope > p').last().click()
  await app.keyboard.insertText('Pasted copy: ')
  await expect(editor.locator(':scope > p').last()).toHaveText('Pasted copy: ')
  await editor.evaluate((element, data) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', data.html)
    clipboardData.setData('text/plain', data.text)
    const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
  }, copied)
  await expect(editor.getByRole('checkbox')).toHaveCount(4)
  await expect(editor.getByRole('checkbox', { name: 'Parent task', exact: true })).toHaveCount(2)
  await expect(editor.locator('ul[data-type="task_list"] ul[data-type="task_list"]')).toHaveCount(2)
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(async () => (await vault.read(path)).match(/"checked": true/g)?.length).toBe(2)
})

test('mobile insertion and formatting stay above the on-screen keyboard', async ({ app, vault }) => {
  test.skip(!(await isMobileFrame(app)), 'The mobile frame owns the keyboard inset')
  await app.setViewportSize({ width: 360, height: 640 })
  const path = await vault.write('keyboard.arx', document([{ type: 'paragraph' }]))
  const editor = await openArx(app, path)
  await editor.click()
  await app.keyboard.insertText('/task')
  await app.evaluate(() => {
    const viewport = window.visualViewport
    if (!viewport) throw new Error('Visual viewport is required for keyboard geometry')
    Object.defineProperties(viewport, { height: { configurable: true, value: 320 }, offsetTop: { configurable: true, value: 0 } })
    viewport.dispatchEvent(new Event('resize'))
  })
  const menu = app.getByRole('listbox', { name: 'Insert block' })
  await expect.poll(() => menu.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(320)
  await app.evaluate(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 40 })
    viewport.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => menu.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(48)
  await app.getByRole('option', { name: 'Task list', exact: true }).click()
  await app.keyboard.insertText('A task above the keyboard')
  await app.keyboard.press('Home')
  await app.keyboard.press('Shift+End')
  await app.getByRole('button', { name: 'More formatting', exact: true }).click()
  const sheet = app.getByRole('dialog', { name: 'Formatting', exact: true })
  await expect(sheet).toBeVisible()
  await expect.poll(() => sheet.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(360)
  const screenshot = test.info().outputPath('keyboard-formatting.png')
  await app.screenshot({ path: screenshot, scale: 'css' })
  await test.info().attach('keyboard-formatting', { path: screenshot, contentType: 'image/png' })
  await app.keyboard.press('Escape')
  await expect(editor).toContainText('A task above the keyboard')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('A task above the keyboard')
})
