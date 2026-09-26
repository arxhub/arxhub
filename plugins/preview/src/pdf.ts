// Pure PDF layout helpers — the parts of PdfPanel.vue that do not touch pdf.js or the DOM, so they can
// be unit tested. pdf.js itself needs a real document and a canvas; it cannot run in vitest here.

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3
export const ZOOM_STEP = 0.25
// 1 means "fit the stage width" — the zoom control moves away from that baseline, it does not replace it.
export const DEFAULT_ZOOM = 1

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export interface PageSize {
  readonly width: number
  readonly height: number
}

// A page's own points (pdf.js reports these at scale 1) fit to the stage width, then the zoom factor
// moves off that fit. `scale` is what pdf.js's own `getViewport({ scale })` and render() need.
export function fitWidthSize(page: PageSize, stageWidth: number, zoom: number): PageSize & { scale: number } {
  const scale = page.width > 0 ? (stageWidth / page.width) * zoom : zoom
  return { width: page.width * scale, height: page.height * scale, scale }
}

// The canvas's backing store, in device pixels — what actually gets drawn to — is deliberately a
// separate number from its CSS box: a canvas sized only in CSS pixels renders blurry on any display
// above 1x, and one sized in device pixels with no CSS box overflows a stage sized in CSS pixels.
export function canvasPixelSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): { width: number; height: number } {
  return { width: Math.max(1, Math.round(cssWidth * devicePixelRatio)), height: Math.max(1, Math.round(cssHeight * devicePixelRatio)) }
}

export function formatPageCount(count: number): string {
  return `${count} ${count === 1 ? 'page' : 'pages'}`
}

// A search hit names its page as the anchor's `part` ('12'). The file may have lost pages since it was
// indexed, so a page past the end lands on the last one rather than nowhere; anything that is not a
// page number at all is not an address this viewer can follow.
export function pageOfAnchor(anchor: { readonly part?: string }, numPages: number): number | null {
  if (numPages < 1 || anchor.part == null || !/^\d+$/.test(anchor.part)) return null
  const page = Number.parseInt(anchor.part, 10)
  if (page < 1) return null
  return Math.min(page, numPages)
}

// Which page is being read: the one crossing `offset`, measured from the first page's top edge. Every page
// shares page 1's size (see PdfPanel), so this is arithmetic rather than a measurement of each box — the
// band reads it on every scroll frame.
export function pageAtOffset(offset: number, pageHeight: number, gap: number, count: number): number {
  if (count < 1) return 0
  if (pageHeight <= 0) return 1
  const page = Math.floor(Math.max(0, offset) / (pageHeight + gap)) + 1
  return Math.min(count, page)
}

export function formatPageOf(page: number, count: number): string {
  return `Page ${page} of ${count}`
}
