import { expect, openFile, test } from './fixtures'

// The smallest valid GIF: one transparent pixel. Binary on purpose — the point is that a file no text
// viewer claims opens as what it is.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

// A hand-written, one-page PDF — no library, just the objects pdf.js needs: a Catalog, a Pages tree of
// one Page, and an empty content stream. The xref offsets are computed rather than guessed so pdf.js
// parses the table itself instead of falling back to its own document scan. An unreferenced stream
// separates the page from the xref so the same smoke test proves that opening does not read it all.
function minimalOnePagePdf(): Buffer {
  let pdf = '%PDF-1.4\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    `<< /Length 524288 >>\nstream\n${' '.repeat(524288)}\nendstream`,
  ]
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets[i + 1] = Buffer.byteLength(pdf, 'ascii')
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf, 'ascii')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(pdf, 'ascii')
}

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

    // The dev stand runs in a browser (HTTP backend) — it cannot hand a file to a system application,
    // so the action must not be drawn at all here. The Tauri path is not reachable from e2e.
    await expect(app.getByRole('button', { name: 'Open in system app' })).toHaveCount(0)
  })

  test('a PDF opens as pages, rendered by pdf.js', async ({ app, vault }) => {
    const pdf = minimalOnePagePdf()
    const path = await vault.write('scan.pdf', pdf)
    const reads: URL[] = []
    app.on('request', (request) => {
      const url = new URL(request.url())
      if (url.searchParams.get('path') === `vault/${path}` && /\/read(?:-range)?$/.test(url.pathname)) reads.push(url)
    })

    await openFile(app, path)

    await expect(app.getByText('1 page', { exact: false })).toBeVisible()
    const canvas = app.locator('.pdf-canvas')
    await expect(canvas).toBeVisible()
    await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.getBoundingClientRect().width)).toBeGreaterThan(0)
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every((url) => url.pathname.endsWith('/read-range'))).toBe(true)
    expect(reads.reduce((total, url) => total + Number(url.searchParams.get('length')), 0)).toBeLessThan(pdf.length)
  })
})
