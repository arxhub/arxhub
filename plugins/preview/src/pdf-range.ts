import { illegalState, validation } from '@arxhub/errors'
import type { RangeReader } from '@arxhub/vfs'
import { AbortException, PDFDataRangeTransport } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { copyBytes } from './media'

export interface PdfRangeDocumentOptions {
  range: PDFDataRangeTransport
  disableStream: true
  disableAutoFetch: true
}

export interface PdfJsLoadingTask<Document> {
  readonly promise: Promise<Document>
  destroy(): Promise<void>
}

export type PdfDocumentFactory<Document> = (options: PdfRangeDocumentOptions) => PdfJsLoadingTask<Document>

export interface PdfRangeLoadingTask<Document> {
  // Unlike pdf.js's raw task.promise, this also rejects when a VFS range read fails or the session is
  // cancelled. PDFDataRangeTransport has no error callback of its own, so exposing the raw promise
  // would leave callers waiting forever after a rejected readRange().
  readonly promise: Promise<{ document: Document; size: number }>
  // Stays live after `promise` resolves: parsing a later page can ask for another range, and that read
  // can still fail. The panel observes this channel for a visible error and tears the document down.
  readonly failed: Promise<never>
  waitFor<T>(operation: Promise<T>): Promise<T>
  destroy(): Promise<void>
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(cause: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

class VfsPdfRangeTransport extends PDFDataRangeTransport {
  private stopped = false

  constructor(
    length: number,
    private readonly reader: RangeReader,
    private readonly onFailure: (cause: unknown) => void,
  ) {
    // No initial data: pdf.js chooses the first range it needs (normally the trailer at the end) rather
    // than making this adapter guess and front-load bytes. `progressiveDone` remains false because this
    // is a range source, not a progressive stream.
    super(length, null)
  }

  override requestDataRange(begin: number, end: number): void {
    void this.read(begin, end)
  }

  override abort(): void {
    // RangeReader has no AbortSignal. Cancellation therefore prevents delivery and ignores a late VFS
    // result; it does not claim to stop I/O already in flight.
    this.stopped = true
  }

  private async read(begin: number, end: number): Promise<void> {
    if (this.stopped) return
    try {
      if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end <= begin || end > this.length) {
        throw validation(`Invalid PDF byte range [${begin}, ${end}) for a ${this.length}-byte file`)
      }
      const expected = end - begin
      const bytes = await this.reader.readRange(begin, expected)
      if (this.stopped) return
      if (bytes.byteLength !== expected) {
        throw illegalState(`PDF range [${begin}, ${end}) returned ${bytes.byteLength} bytes instead of ${expected}`)
      }
      // A Node backend may return Buffer, whose shared pool must not be transferred to the pdf.js
      // worker. Always hand the transport an owned plain Uint8Array.
      this.onDataRange(begin, copyBytes(bytes))
    } catch (cause) {
      if (!this.stopped) this.onFailure(cause)
    }
  }
}

export function createPdfRangeLoadingTask<Document>(
  reader: RangeReader,
  getDocument: PdfDocumentFactory<Document>,
): PdfRangeLoadingTask<Document> {
  const failure = deferred<never>()
  const cancelled = deferred<never>()
  // These promises can reject before head() returns and before a caller gets far enough to attach its
  // observer. The no-op handlers close that unhandled-rejection window; callers still receive the
  // original promises and their original rejection.
  void failure.promise.catch(() => undefined)
  void cancelled.promise.catch(() => undefined)

  let stopped = false
  let transport: VfsPdfRangeTransport | null = null
  let inner: PdfJsLoadingTask<Document> | null = null
  let destroyPromise: Promise<void> | null = null
  let failed = false

  const stopInner = (): Promise<void> => {
    if (destroyPromise != null) return destroyPromise
    // Do not memoize an empty cleanup. A deliberately adversarial factory can request a range and
    // synchronously trigger failure before it returns its task; that task still has to be destroyed as
    // soon as it is assigned below.
    if (inner == null) return Promise.resolve()
    destroyPromise = inner.destroy().catch(() => undefined)
    return destroyPromise
  }

  const reportFailure = (cause: unknown): void => {
    if (failed || stopped) return
    failed = true
    transport?.abort()
    failure.reject(cause)
    // A failure after the document opened has no waiter in the opening path to do cleanup. Start it
    // here as well; destroy() is idempotent and its rejection is contained by stopInner().
    void stopInner()
  }

  const waitFor = <T>(operation: Promise<T>): Promise<T> => Promise.race([operation, failure.promise, cancelled.promise])

  const promise = (async (): Promise<{ document: Document; size: number }> => {
    try {
      const { size } = await waitFor(reader.head())
      if (stopped) throw new AbortException('PDF range loading was cancelled')
      if (!Number.isSafeInteger(size) || size < 0) throw validation(`Invalid PDF file size: ${size}`)

      transport = new VfsPdfRangeTransport(size, reader, reportFailure)
      if (stopped) {
        transport.abort()
        throw new AbortException('PDF range loading was cancelled')
      }

      inner = getDocument({ range: transport, disableStream: true, disableAutoFetch: true })
      // Covers a synchronous factory request whose reader threw before getDocument returned.
      if (failed) void stopInner()
      const document = await waitFor(inner.promise)
      return { document, size }
    } catch (cause) {
      transport?.abort()
      // Settle the public failure channel for head/parser/factory errors too. Cancellation remains a
      // separate control-flow signal and must not become a visible “could not read” error.
      if (!stopped && !failed) {
        failed = true
        failure.reject(cause)
      }
      await stopInner()
      throw cause
    }
  })()

  return {
    promise,
    failed: failure.promise,
    waitFor,
    destroy: () => {
      if (!stopped) {
        stopped = true
        transport?.abort()
        cancelled.reject(new AbortException('PDF range loading was cancelled'))
      }
      return stopInner()
    },
  }
}
