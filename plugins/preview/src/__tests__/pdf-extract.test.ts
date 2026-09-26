import { describe, expect, test } from 'vitest'
import { pageText, pdfExtractor } from '../pdf-extract'

// Node has no Worker; with the worker module loaded on the main thread pdf.js runs its "fake worker"
// from it instead of importing the asset URL the browser build points at.
await import('pdfjs-dist/legacy/build/pdf.worker.mjs')

// The smallest PDF pdf.js reads text from: Helvetica (a standard font, no embedding), one content
// stream per page, a correct xref. An empty line list is a page with no text layer — a scan.
function buildPdf(pages: string[][], title?: string): Uint8Array {
  const objects: string[] = []
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  objects.push(title == null ? '<< >>' : `<< /Title (${title}) >>`)
  pages.forEach((lines, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6 + i * 2} 0 R >>`)
    const stream = lines.map((line, j) => `BT /F1 12 Tf 72 ${720 - j * 20} Td (${line}) Tj ET`).join('\n')
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

function input(bytes: Uint8Array) {
  return {
    path: 'vault/paper.pdf',
    bytes,
    text: () => new TextDecoder().decode(bytes),
    stat: { size: bytes.byteLength, mtime: 0, ctime: 0 },
  }
}

describe('pageText', () => {
  test('joins runs as emitted and breaks where a line ended', () => {
    expect(
      pageText([
        { str: 'Hello', hasEOL: false },
        { str: ' ', hasEOL: false },
        { str: 'world', hasEOL: true },
        { str: 'next', hasEOL: false },
      ]),
    ).toBe('Hello world\nnext')
  })

  test('collapses layout whitespace and drops empty lines', () => {
    expect(
      pageText([
        { str: '  a \t  b ', hasEOL: true },
        { str: '   ', hasEOL: true },
        { str: 'c', hasEOL: false },
      ]),
    ).toBe('a b\nc')
  })

  test('skips marked-content entries that carry no text', () => {
    expect(pageText([{ type: 'beginMarkedContent' }, { str: 'text', hasEOL: false }, { type: 'endMarkedContent' }])).toBe('text')
  })
})

describe('pdfExtractor', () => {
  test('claims .pdf and reads its text as data, not markup', () => {
    expect(pdfExtractor.extensions).toEqual(['.pdf'])
    expect(pdfExtractor.inlineMarkup).toBe(false)
  })

  test('one page block per page with text, anchored by page number', async () => {
    const bytes = buildPdf([['Hello world', 'second line'], [], ['page three']], 'A Paper')
    const extraction = await pdfExtractor.extract(input(bytes))
    expect(extraction).toEqual({
      title: 'A Paper',
      blocks: [
        { type: 'page', content: 'Hello world\nsecond line', anchor: { part: '1' } },
        { type: 'page', content: 'page three', anchor: { part: '3' } },
      ],
    })
  })

  test('a PDF with no text layer and no title yields no blocks and no title', async () => {
    const extraction = await pdfExtractor.extract(input(buildPdf([[]])))
    expect(extraction).toEqual({ blocks: [] })
  })

  test('a file that is not a PDF rejects, so the engine indexes it by metadata', async () => {
    await expect(pdfExtractor.extract(input(new TextEncoder().encode('not a pdf')))).rejects.toThrow()
  })
})
