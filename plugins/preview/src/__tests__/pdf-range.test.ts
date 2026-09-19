import type { RangeReader } from '@arxhub/vfs'
import { AbortException, type PDFDataRangeTransport } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, test, vi } from 'vitest'
import { createPdfRangeLoadingTask, type PdfJsLoadingTask, type PdfRangeDocumentOptions } from '../pdf-range'

interface RangeEvent {
  type: 'range'
  begin: number
  chunk: Uint8Array
}

interface Deferred<T> {
  promise: Promise<T>
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

function readyTransport(options: PdfRangeDocumentOptions, events: RangeEvent[]): PDFDataRangeTransport {
  options.range.transportReady((event: RangeEvent) => {
    if (event.type === 'range') events.push(event)
  })
  return options.range
}

describe('PDF VFS range loading', () => {
  test('requests exact start and end ranges and gives pdf.js owned Uint8Arrays', async () => {
    const bytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    const readRange = vi.fn((offset: number, length?: number) => Promise.resolve(bytes.subarray(offset, offset + (length ?? bytes.length))))
    const reader: RangeReader = {
      head: () => Promise.resolve({ size: bytes.byteLength, createdAt: 0, modifiedAt: 0 }),
      readRange,
    }
    const events: RangeEvent[] = []
    let transport!: PDFDataRangeTransport
    const document = { name: 'opened' }
    const inner: PdfJsLoadingTask<typeof document> = { promise: Promise.resolve(document), destroy: vi.fn(() => Promise.resolve()) }

    const task = createPdfRangeLoadingTask(reader, (options) => {
      expect(options).toMatchObject({ disableStream: true, disableAutoFetch: true })
      transport = readyTransport(options, events)
      return inner
    })

    await expect(task.promise).resolves.toEqual({ document, size: 10 })
    transport.requestDataRange(0, 3)
    transport.requestDataRange(7, 10)
    await vi.waitFor(() => expect(events).toHaveLength(2))

    expect(readRange.mock.calls).toEqual([
      [0, 3],
      [7, 3],
    ])
    expect(events.map(({ begin, chunk }) => [begin, [...chunk]])).toEqual([
      [0, [0, 1, 2]],
      [7, [7, 8, 9]],
    ])
    expect(Buffer.isBuffer(events[0]?.chunk)).toBe(false)
    expect(events[0]?.chunk.buffer).not.toBe(bytes.buffer)
  })

  test('a synchronous range failure rejects the public task and destroys the raw pdf.js task', async () => {
    const failure = new Error('range unavailable')
    const reader: RangeReader = {
      head: () => Promise.resolve({ size: 4, createdAt: 0, modifiedAt: 0 }),
      readRange: () => {
        throw failure
      },
    }
    const never = deferred<object>()
    const destroy = vi.fn(() => Promise.resolve())

    const task = createPdfRangeLoadingTask(reader, (options) => {
      options.range.transportReady(() => undefined)
      // Adversarial on purpose: fail before this factory returns its task. Cleanup must still discover
      // and destroy the task once the assignment completes.
      options.range.requestDataRange(0, 4)
      return { promise: never.promise, destroy }
    })

    await expect(task.promise).rejects.toBe(failure)
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce())
  })

  test('a range failure after the document opens reaches the live failure channel and tears it down', async () => {
    const failure = new Error('later range unavailable')
    let rejectRanges = false
    const reader: RangeReader = {
      head: () => Promise.resolve({ size: 8, createdAt: 0, modifiedAt: 0 }),
      readRange: (offset, length) => (rejectRanges ? Promise.reject(failure) : Promise.resolve(new Uint8Array(length ?? 8).fill(offset))),
    }
    const destroy = vi.fn(() => Promise.resolve())
    let transport!: PDFDataRangeTransport
    const task = createPdfRangeLoadingTask(reader, (options) => {
      transport = readyTransport(options, [])
      return { promise: Promise.resolve({ name: 'opened' }), destroy }
    })

    await expect(task.promise).resolves.toMatchObject({ size: 8 })
    rejectRanges = true
    transport.requestDataRange(4, 8)

    await expect(task.failed).rejects.toBe(failure)
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce())
  })

  test('cancel before head returns never opens pdf.js', async () => {
    const head = deferred<{ size: number; createdAt: number; modifiedAt: number }>()
    const reader: RangeReader = { head: () => head.promise, readRange: () => Promise.resolve(new Uint8Array()) }
    const getDocument = vi.fn((): PdfJsLoadingTask<object> => ({ promise: Promise.resolve({}), destroy: () => Promise.resolve() }))
    const task = createPdfRangeLoadingTask(reader, getDocument)

    await task.destroy()
    head.resolve({ size: 10, createdAt: 0, modifiedAt: 0 })

    await expect(task.promise).rejects.toBeInstanceOf(AbortException)
    expect(getDocument).not.toHaveBeenCalled()
  })

  test('cancel during a range ignores its late bytes and does not deliver them to pdf.js', async () => {
    const bytes = deferred<Uint8Array>()
    const readRange = vi.fn(() => bytes.promise)
    const reader: RangeReader = {
      head: () => Promise.resolve({ size: 4, createdAt: 0, modifiedAt: 0 }),
      readRange,
    }
    const events: RangeEvent[] = []
    const destroy = vi.fn(() => Promise.resolve())
    let transport!: PDFDataRangeTransport
    const task = createPdfRangeLoadingTask(reader, (options) => {
      transport = readyTransport(options, events)
      return { promise: Promise.resolve({ name: 'opened' }), destroy }
    })
    await task.promise

    transport.requestDataRange(0, 4)
    await vi.waitFor(() => expect(readRange).toHaveBeenCalledOnce())
    await task.destroy()
    bytes.resolve(new Uint8Array([1, 2, 3, 4]))
    await Promise.resolve()

    expect(events).toEqual([])
    expect(destroy).toHaveBeenCalledOnce()
  })
})
