import { validation } from '@arxhub/errors'

export interface BudgetPosition {
  latitude: number
  longitude: number
  accuracy: number
}

export interface BudgetCaptureOptions {
  signal?: AbortSignal
}

export interface BudgetCapture {
  locate(options?: BudgetCaptureOptions): Promise<BudgetPosition>
  scanReceiptPhoto(blob: Blob, options?: BudgetCaptureOptions): Promise<string | null>
}

interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorInstance {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorInstance
  getSupportedFormats?(): Promise<string[]>
}

const MAX_SCAN_DIMENSION = 4096
const MAX_RECEIPT_PHOTO_SIZE = 10 * 1024 * 1024

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal)
}

async function scanWithBarcodeDetector(blob: Blob, signal?: AbortSignal): Promise<string | undefined> {
  const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
  if (!Detector) return undefined

  try {
    if (Detector.getSupportedFormats) {
      const formats = await Detector.getSupportedFormats()
      throwIfAborted(signal)
      if (!formats.includes('qr_code')) return undefined
    }
    const results = await new Detector({ formats: ['qr_code'] }).detect(blob)
    throwIfAborted(signal)
    // A native miss is not conclusive: jsQR recognizes some low-contrast or rotated receipts that
    // individual BarcodeDetector implementations do not.
    return results.find((result) => result.rawValue.length > 0)?.rawValue
  } catch {
    if (signal?.aborted) throw abortReason(signal)
    // WebViews can expose BarcodeDetector while rejecting Blob inputs or the qr_code format. In
    // that case the bundled decoder below is the reliable path rather than a failed scan.
    return undefined
  }
}

async function receiptPixels(blob: Blob, signal?: AbortSignal): Promise<ImageData> {
  if (typeof createImageBitmap !== 'function') throw validation('This browser cannot decode receipt photos')
  const bitmap = await createImageBitmap(blob)
  try {
    throwIfAborted(signal)
    if (bitmap.width < 1 || bitmap.height < 1) throw validation('The receipt photo is empty')
    const scale = Math.min(1, MAX_SCAN_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw validation('This browser cannot read receipt photos')
    context.drawImage(bitmap, 0, 0, width, height)
    throwIfAborted(signal)
    return context.getImageData(0, 0, width, height)
  } finally {
    bitmap.close()
  }
}

async function locateInBrowser(options?: BudgetCaptureOptions): Promise<BudgetPosition> {
  const { signal } = options ?? {}
  throwIfAborted(signal)
  if (!globalThis.navigator?.geolocation) throw validation('Location is unavailable on this device')

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => finish(() => reject(abortReason(signal as AbortSignal)))
    signal?.addEventListener('abort', onAbort, { once: true })
    navigator.geolocation.getCurrentPosition(
      (position) =>
        finish(() => {
          const { latitude, longitude, accuracy } = position.coords
          if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180 ||
            !Number.isFinite(accuracy) ||
            accuracy < 0
          ) {
            reject(validation('The device returned an invalid location'))
            return
          }
          resolve({ latitude, longitude, accuracy })
        }),
      (error) => finish(() => reject(error)),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    )
  })
}

async function scanInBrowser(blob: Blob, options?: BudgetCaptureOptions): Promise<string | null> {
  const { signal } = options ?? {}
  throwIfAborted(signal)
  if (blob.size < 1) throw validation('Receipt photos must not be empty')
  if (blob.size > MAX_RECEIPT_PHOTO_SIZE) throw validation('Receipt photos can be up to 10 MB')
  const detected = await scanWithBarcodeDetector(blob, signal)
  if (detected !== undefined) return detected

  const image = await receiptPixels(blob, signal)
  throwIfAborted(signal)
  const { default: jsQR } = await import('jsqr')
  throwIfAborted(signal)
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data || null
}

export const browserBudgetCapture: BudgetCapture = {
  locate: locateInBrowser,
  scanReceiptPhoto: scanInBrowser,
}
