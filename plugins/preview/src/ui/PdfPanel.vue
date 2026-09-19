<script setup lang="ts">
import { VfsExtension } from '@arxhub/plugin-vfs'
import { useArxHub } from '@arxhub/uikit/hooks'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  RenderingCancelledException,
  type RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { formatBytes } from '../media'
import { canvasPixelSize, DEFAULT_ZOOM, fitWidthSize, formatPageCount, MAX_ZOOM, MIN_ZOOM, stepZoom } from '../pdf'
import { createPdfRangeLoadingTask, type PdfRangeLoadingTask } from '../pdf-range'
import PdfShell from './PdfShell.vue'

// pdf.js parses off the main thread. Vite recognises `new URL(specifier, import.meta.url)` and resolves
// it to the built worker asset — a plain relative path here would resolve against this .vue file's own
// URL instead of the worker's, which is the one thing pdf.js cannot fall back from.
//
// The `legacy` build, on both sides, not the default one: pdf.js 5.7 reaches for
// `Map.prototype.getOrInsertComputed`, which WKWebView (Safari 18 — the desktop app on macOS, and every
// iOS webview) does not have yet; Chromium does, which is why the e2e never saw it. The legacy build
// carries the polyfills, and the worker runs in the same engine as the page.
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()

const props = defineProps<{ path: string }>()

const arxhub = useArxHub()
const vfs = arxhub.extensions.get(VfsExtension)

const loading = ref(false)
const error = ref('')
const size = ref<number | null>(null)
const zoom = ref(DEFAULT_ZOOM)
const stageWidth = ref(0)

interface PageState {
  readonly index: number
  rendered: boolean
}

// Every page is taken to share page 1's own dimensions — true of the overwhelming majority of PDFs, and
// the alternative (asking pdf.js for every page's viewport before the first paint) would cost one round
// trip per page on the very documents this panel exists to open lazily.
const baseSize = ref<{ width: number; height: number } | null>(null)
const pages = reactive<PageState[]>([])

const stageEl = ref<HTMLElement | null>(null)
const canvasEls = new Map<number, HTMLCanvasElement>()
const activeRenders = new Map<number, RenderTask>()

let loadingTask: PdfRangeLoadingTask<PDFDocumentProxy> | null = null
let doc: PDFDocumentProxy | null = null
let ticket = 0
let stageObserver: ResizeObserver | null = null
let pageObserver: IntersectionObserver | null = null

const pageSize = computed(() => (baseSize.value && stageWidth.value > 0 ? fitWidthSize(baseSize.value, stageWidth.value, zoom.value) : null))
const meta = computed(() => (size.value == null ? '' : `${formatPageCount(pages.length)} · ${formatBytes(size.value)}`))

async function closeDoc() {
  pageObserver?.disconnect()
  for (const task of activeRenders.values()) task.cancel()
  activeRenders.clear()
  renderQueue.clear()
  canvasEls.clear()
  const closing = loadingTask
  loadingTask = null
  doc = null
  if (closing != null) await closing.destroy()
}

function rangeFailure(current: number, task: PdfRangeLoadingTask<PDFDocumentProxy>, cause: unknown): void {
  if (current !== ticket || loadingTask !== task) return
  // Invalidate every getPage/render continuation before clearing the document. The failed task tears
  // itself down too, but its worker may still reject operations on a later microtask.
  ticket++
  pageObserver?.disconnect()
  for (const render of activeRenders.values()) render.cancel()
  activeRenders.clear()
  renderQueue.clear()
  canvasEls.clear()
  loadingTask = null
  doc = null
  baseSize.value = null
  size.value = null
  pages.length = 0
  loading.value = false
  arxhub.logger.error(`[preview] could not read ${props.path}: ${cause instanceof Error ? cause.message : String(cause)}`, cause)
  error.value = cause instanceof Error ? cause.message : 'Could not read the PDF'
  // Idempotent: the range helper starts this teardown as soon as the read rejects. Awaiting is not
  // needed to show the error, and containing the promise keeps a cleanup failure out of the console.
  void task.destroy().catch((cleanupCause: unknown) => arxhub.logger.error('[preview] could not close the failed PDF task', cleanupCause))
}

async function load() {
  const current = ++ticket
  await closeDoc()
  if (current !== ticket) return
  error.value = ''
  size.value = null
  baseSize.value = null
  pages.length = 0
  loading.value = true
  try {
    // One reader is one storage snapshot. Pending repository files may advance their manifest while a
    // PDF is open; every range for this document must still come from the head whose size is below.
    const reader = await vfs.openRangeReader(props.path)
    if (current !== ticket) return
    const task = createPdfRangeLoadingTask(reader, (options) => getDocument(options))
    loadingTask = task
    let openedRange = false
    void task.failed.catch((cause: unknown) => {
      // Before the document opens, task.promise carries the same failure into this load() catch. Once
      // open, this is the only channel pdf.js offers for a later page's failed byte range.
      if (openedRange) rangeFailure(current, task, cause)
    })
    const { document: opened, size: fileSize } = await task.promise
    openedRange = true
    if (current !== ticket) {
      await task.destroy()
      return
    }
    doc = opened
    const first = await task.waitFor(opened.getPage(1))
    if (current !== ticket) return
    const viewport = first.getViewport({ scale: 1 })
    baseSize.value = { width: viewport.width, height: viewport.height }
    pages.push(...Array.from({ length: opened.numPages }, (_, i) => ({ index: i + 1, rendered: false })))
    size.value = fileSize
  } catch (cause) {
    if (current !== ticket) return
    const failedTask = loadingTask
    loadingTask = null
    doc = null
    arxhub.logger.error(`[preview] could not load ${props.path}`, cause)
    error.value = cause instanceof Error ? cause.message : 'Could not open the PDF'
    // Show the failure in this tick. Worker teardown may take longer and a new path may start while it
    // runs; it must not let this old catch resume later and overwrite the new panel state.
    void failedTask
      ?.destroy()
      .catch((cleanupCause: unknown) => arxhub.logger.error('[preview] could not close the failed PDF task', cleanupCause))
  } finally {
    if (current === ticket) loading.value = false
  }
}

// A wrapper comes within one viewport of view → it starts rendering and stays rendered, so scrolling
// past a page and back never re-triggers work already done.
function observeWrapper(el: Element | null, page: PageState) {
  if (el == null || pageObserver == null || page.rendered) return
  pageObserver.observe(el)
}

function onCanvasRef(index: number, el: Element | null) {
  if (el == null) {
    canvasEls.delete(index)
    return
  }
  const canvas = el as HTMLCanvasElement
  canvasEls.set(index, canvas)
  void renderPage(index, canvas)
}

// One render at a time per canvas, in arrival order. pdf.js refuses a second render() on a canvas
// until the previous task has actually settled, and cancel() only asks — so two callers (the
// intersection observer and the zoom/resize watcher fire independently) are chained rather than
// raced: the in-flight task is asked to stop, and the next render starts only once the chain's
// previous link has awaited it. Seen in the desktop app as 'Cannot use the same canvas during
// multiple render() operations'; Chromium's timing never produced it.
const renderQueue = new Map<number, Promise<void>>()

function renderPage(index: number, canvas: HTMLCanvasElement): Promise<void> {
  activeRenders.get(index)?.cancel()
  const next = (renderQueue.get(index) ?? Promise.resolve()).then(() => renderPageNow(index, canvas))
  renderQueue.set(index, next)
  return next
}

async function renderPageNow(index: number, canvas: HTMLCanvasElement) {
  const rangeTask = loadingTask
  if (doc == null || rangeTask == null || pageSize.value == null) return
  const current = ticket
  try {
    const page = await rangeTask.waitFor(doc.getPage(index))
    if (current !== ticket || pageSize.value == null) return
    const viewport = page.getViewport({ scale: pageSize.value.scale })
    const pixel = canvasPixelSize(viewport.width, viewport.height, window.devicePixelRatio || 1)
    canvas.width = pixel.width
    canvas.height = pixel.height
    const task = page.render({ canvas, viewport })
    activeRenders.set(index, task)
    await rangeTask.waitFor(task.promise)
    if (activeRenders.get(index) === task) activeRenders.delete(index)
  } catch (cause) {
    if (current === ticket && !(cause instanceof RenderingCancelledException)) {
      // The message is in the line itself: the webview relays only the first argument of a console error,
      // and 'could not render' without the reason is a report nobody can act on.
      arxhub.logger.error(
        `[preview] could not render page ${index} of ${props.path}: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      )
    }
  }
}

function rerenderVisible() {
  for (const [index, canvas] of canvasEls) void renderPage(index, canvas)
}

watch([zoom, stageWidth], () => {
  if (pages.length > 0) rerenderVisible()
})
watch(
  () => props.path,
  () => void load(),
  { immediate: true },
)

onMounted(() => {
  const stage = stageEl.value
  if (stage == null) return
  stageWidth.value = stage.clientWidth
  stageObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry != null) stageWidth.value = entry.contentRect.width
  })
  stageObserver.observe(stage)
  // rootMargin percentages are relative to the root's own box, so "100%" top and bottom is exactly one
  // stage-height of lookahead in each direction without measuring anything by hand.
  pageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const index = Number((entry.target as HTMLElement).dataset.pageIndex)
        const page = pages.find((p) => p.index === index)
        if (page == null || page.rendered) continue
        page.rendered = true
        pageObserver?.unobserve(entry.target)
      }
    },
    { root: stage, rootMargin: '100% 0px' },
  )
})

onBeforeUnmount(() => {
  ticket++
  stageObserver?.disconnect()
  void closeDoc().catch((cause: unknown) => arxhub.logger.error('[preview] could not close the PDF task', cause))
})
</script>

<template>
  <div class="pdf-panel">
    <PdfShell
      :path="path"
      :meta="meta"
      :zoom="zoom"
      :on-zoom-out="() => (zoom = stepZoom(zoom, -1))"
      :on-zoom-in="() => (zoom = stepZoom(zoom, 1))"
    >
      <div ref="stageEl" class="pdf-stage">
        <p v-if="loading" class="media-state">Loading…</p>
        <template v-else-if="error">
          <p class="media-state">{{ error }}</p>
          <p class="media-path">{{ path }}</p>
        </template>
        <div
          v-for="page in pages"
          v-else
          :key="page.index"
          :ref="(el) => observeWrapper(el as Element | null, page)"
          class="pdf-page"
          :data-page-index="page.index"
          :style="pageSize ? { width: `${pageSize.width}px`, height: `${pageSize.height}px` } : undefined"
        >
          <canvas v-if="page.rendered" :ref="(el) => onCanvasRef(page.index, el as Element | null)" class="pdf-canvas" />
        </div>
      </div>
    </PdfShell>
  </div>
</template>

<style scoped>
.pdf-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--gray-1);
}

.pdf-stage {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px;
  overflow: auto;
}

.pdf-page {
  flex-shrink: 0;
  overflow: hidden;
  background: var(--gray-3);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
}

.pdf-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.media-state {
  margin: 0;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  text-align: center;
}

.media-path {
  margin: 0;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
  text-align: center;
}
</style>
