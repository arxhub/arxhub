declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

// The worker entry ships no declarations. Only the tests import it, for its side effect: it installs
// `globalThis.pdfjsWorker`, which pdf.js's main-thread fallback uses where there is no Worker (Node).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs'
