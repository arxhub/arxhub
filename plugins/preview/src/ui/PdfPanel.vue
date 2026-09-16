<script setup lang="ts">
import { DocumentName } from '@arxhub/plugin-notes/ui'
import { IconButton, Strip } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { VaultVfs } from '@arxhub/vfs'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  RenderingCancelledException,
  type RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { formatBytes } from '../media'
import { canvasPixelSize, DEFAULT_ZOOM, fitWidthSize, formatPageCount, MAX_ZOOM, MIN_ZOOM, stepZoom } from '../pdf'

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
const vfs = arxhub.services.get(VaultVfs)

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

let loadingTask: PDFDocumentLoadingTask | null = null
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

async function load() {
  const current = ++ticket
  await closeDoc()
  error.value = ''
  size.value = null
  baseSize.value = null
  pages.length = 0
  loading.value = true
  try {
    const [{ size: fileSize }, bytes] = await Promise.all([vfs.head(props.path), vfs.read(props.path)])
    if (current !== ticket) return
    // pdf.js refuses a Node Buffer outright (it transfers `data` to its worker and a Buffer's shared
    // pool allocation is not safe to detach) — the node VFS backend's `read()` returns exactly that, so
    // a copy into a plain Uint8Array is not optional here the way it would be for any other backend.
    const task = getDocument({ data: new Uint8Array(bytes) })
    loadingTask = task
    const opened = await task.promise
    if (current !== ticket) {
      await opened.destroy()
      return
    }
    doc = opened
    const first = await opened.getPage(1)
    if (current !== ticket) return
    const viewport = first.getViewport({ scale: 1 })
    baseSize.value = { width: viewport.width, height: viewport.height }
    pages.push(...Array.from({ length: opened.numPages }, (_, i) => ({ index: i + 1, rendered: false })))
    size.value = fileSize
  } catch (cause) {
    if (current !== ticket) return
    arxhub.logger.error(`[preview] could not load ${props.path}`, cause)
    error.value = cause instanceof Error ? cause.message : 'Could not open the PDF'
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
  if (doc == null || pageSize.value == null) return
  const current = ticket
  try {
    const page = await doc.getPage(index)
    if (current !== ticket || pageSize.value == null) return
    const viewport = page.getViewport({ scale: pageSize.value.scale })
    const pixel = canvasPixelSize(viewport.width, viewport.height, window.devicePixelRatio || 1)
    canvas.width = pixel.width
    canvas.height = pixel.height
    const task = page.render({ canvas, viewport })
    activeRenders.set(index, task)
    await task.promise
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
  void closeDoc()
})
</script>

<template>
  <div class="pdf-panel">
    <Strip flush-actions>
      <DocumentName :path="path" />
      <span v-if="meta" class="pdf-meta">{{ meta }}</span>
      <template #actions>
        <IconButton size="lg" icon="lu:zoom-out" tooltip="Zoom out" :disabled="zoom <= MIN_ZOOM" @click="zoom = stepZoom(zoom, -1)" />
        <IconButton size="lg" icon="lu:zoom-in" tooltip="Zoom in" :disabled="zoom >= MAX_ZOOM" @click="zoom = stepZoom(zoom, 1)" />
      </template>
    </Strip>
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

.pdf-meta {
  color: var(--gray-11);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  white-space: nowrap;
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
