import { expect, openFile, test } from './fixtures'

// The smallest valid GIF: one transparent pixel. Binary on purpose — the point is that a file no text
// viewer claims opens as what it is.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

test.describe('opening a file that is not a note', () => {
  test('an image opens as an image', async ({ app, vault }) => {
    const path = await vault.write('pixel.gif', PIXEL)

    await openFile(app, path)

    const image = app.getByRole('img', { name: 'pixel.gif' })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1)
  })

  test('a file nothing claims still opens, and says so instead of refusing', async ({ app, vault }) => {
    const path = await vault.write('archive.zip', 'PK')

    await openFile(app, path)

    // The panel, not a toast: it names what is missing and stays on screen.
    await expect(app.getByText('Nothing can open this file')).toBeVisible()
    await expect(app.getByText('No installed viewer claims this extension.')).toBeVisible()
  })
})
