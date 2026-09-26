import type { DocumentExtractor, ExtractedBlock, ExtractInput, Extraction } from '@arxhub/plugin-search'

export const PDF_EXTRACTOR_ID = 'pdf'

// pdf.js's text content, structurally — its `TextItem`/`TextMarkedContent` are not exported from the
// entry point. Marked-content entries carry no text and are skipped; `hasEOL` is pdf.js's own verdict
// that a line ended after this run.
export type PdfTextItem = { readonly str: string; readonly hasEOL: boolean } | { readonly type: string }

// A page's text as a reader would copy it: runs joined as pdf.js emits them (it emits the spaces
// between words as runs of their own), broken where pdf.js says a line ended, and every other stretch
// of whitespace — a layout artefact, not content — collapsed to one space.
export function pageText(items: readonly PdfTextItem[]): string {
  let text = ''
  for (const item of items) {
    if (!('str' in item)) continue
    text += item.str
    if (item.hasEOL) text += '\n'
  }
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
}

// pdf.js is imported inside the call so a boot that never indexes a PDF never loads it.
async function extractPdf(input: ExtractInput): Promise<Extraction> {
  const [pdfjs, { configurePdfWorker }] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('./pdf-worker')])
  configurePdfWorker()
  const task = pdfjs.getDocument({
    // A copy: pdf.js transfers the buffer to its worker, and the indexer's bytes are not ours to detach.
    data: new Uint8Array(input.bytes),
    disableFontFace: true,
    // Text extraction does not draw glyphs, so the missing standard-font data it warns about costs nothing.
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  })
  try {
    const doc = await task.promise
    const blocks: ExtractedBlock[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = pageText((await page.getTextContent()).items)
      page.cleanup()
      // A scanned page has no text layer; without OCR there is nothing to find on it.
      if (content !== '') blocks.push({ type: 'page', content, anchor: { part: String(n) } })
    }
    const { info } = await doc.getMetadata()
    const title = titleOf(info)
    return { blocks, ...(title != null ? { title } : {}) }
  } finally {
    await task.destroy()
  }
}

function titleOf(info: unknown): string | null {
  if (info == null || typeof info !== 'object') return null
  const title = (info as Record<string, unknown>).Title
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : null
}

export const pdfExtractor: DocumentExtractor = {
  id: PDF_EXTRACTOR_ID,
  kind: 'pdf',
  version: 1,
  extensions: ['.pdf'],
  inlineMarkup: false,
  extract: extractPdf,
}
