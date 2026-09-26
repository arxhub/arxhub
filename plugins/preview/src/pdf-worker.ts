import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

// pdf.js parses off the main thread. Vite recognises `new URL(specifier, import.meta.url)` and resolves
// it to the built worker asset — a plain relative path here would resolve against this module's own
// URL instead of the worker's, which is the one thing pdf.js cannot fall back from.
//
// The `legacy` build, on both sides, not the default one: pdf.js 5.7 reaches for
// `Map.prototype.getOrInsertComputed`, which WKWebView (Safari 18 — the desktop app on macOS, and every
// iOS webview) does not have yet; Chromium does, which is why the e2e never saw it. The legacy build
// carries the polyfills, and the worker runs in the same engine as the page.
//
// One place for both callers (the panel and the search extractor): a second copy of the line would be
// a second chance to point the worker at the non-legacy build.
export function configurePdfWorker(): void {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
}
