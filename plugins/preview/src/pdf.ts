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

// Rounded to the step's own precision so repeated clicks land on 0.5, 0.75, 1 … rather than drifting
// off it from floating-point addition (0.1 + 0.2 territory).
export function stepZoom(current: number, direction: 1 | -1): number {
  const stepped = Math.round((current + direction * ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP
  return clampZoom(Math.round(stepped * 100) / 100)
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
