// Reading a QR code out of a picture or a camera frame, for every surface that needs one (a receipt
// photo in budget, the pairing invitation on a second device). The platform decoder first, the bundled
// one when there is none or it cannot take the input.

export type QrSource = Blob | HTMLVideoElement | HTMLCanvasElement | ImageBitmap

export interface DecodeQrOptions {
  signal?: AbortSignal
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

// A photo is scaled down to this before the bundled decoder reads it: past it a phone's photo costs
// seconds on the main thread and finds nothing a smaller copy would not.
const MAX_SCAN_DIMENSION = 4096

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal)
}

// One detector for the page's life — a camera scanner asks five times a second, and constructing one
// (and asking for its formats) every time is the part that costs.
let detector: Promise<BarcodeDetectorInstance | null> | null = null

function platformDetector(): Promise<BarcodeDetectorInstance | null> {
  detector ??= (async () => {
    const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
    if (!Detector) return null
    try {
      if (Detector.getSupportedFormats && !(await Detector.getSupportedFormats()).includes('qr_code')) return null
      return new Detector({ formats: ['qr_code'] })
    } catch {
      return null
    }
  })()
  return detector
}

// Only for tests: the detector above is cached for the page's life, and a test swaps the global.
export function resetQrDetector(): void {
  detector = null
}

async function detectOnPlatform(source: QrSource, signal?: AbortSignal): Promise<string | undefined> {
  const instance = await platformDetector()
  throwIfAborted(signal)
  if (instance == null) return undefined
  try {
    const results = await instance.detect(source)
    throwIfAborted(signal)
    // A native miss is not conclusive: jsQR recognizes some low-contrast or rotated codes that
    // individual BarcodeDetector implementations do not.
    return results.find((result) => result.rawValue.length > 0)?.rawValue
  } catch {
    if (signal?.aborted) throw abortReason(signal)
    // WebViews can expose BarcodeDetector while rejecting some inputs or the qr_code format. The
    // bundled decoder below is then the reliable path rather than a failed scan.
    return undefined
  }
}

function sizeOf(source: Exclude<QrSource, Blob>): { width: number; height: number } {
  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight }
  }
  return { width: source.width, height: source.height }
}

async function pixelsOf(source: QrSource, signal?: AbortSignal): Promise<ImageData | null> {
  if (typeof document === 'undefined') return null
  let bitmap: ImageBitmap | null = null
  try {
    let drawable: Exclude<QrSource, Blob>
    if (source instanceof Blob) {
      if (typeof createImageBitmap !== 'function') return null
      bitmap = await createImageBitmap(source)
      drawable = bitmap
    } else {
      drawable = source
    }
    throwIfAborted(signal)
    const size = sizeOf(drawable)
    // A video before its first frame has no size yet: nothing to read, which is a miss, not an error.
    if (size.width < 1 || size.height < 1) return null
    const scale = Math.min(1, MAX_SCAN_DIMENSION / Math.max(size.width, size.height))
    const width = Math.max(1, Math.round(size.width * scale))
    const height = Math.max(1, Math.round(size.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(drawable, 0, 0, width, height)
    return context.getImageData(0, 0, width, height)
  } finally {
    bitmap?.close()
  }
}

// The text of the first QR code in the picture, or null when there is none (or the browser can read
// neither pictures nor frames).
export async function decodeQr(source: QrSource, options: DecodeQrOptions = {}): Promise<string | null> {
  const { signal } = options
  throwIfAborted(signal)
  const detected = await detectOnPlatform(source, signal)
  if (detected !== undefined) return detected

  const image = await pixelsOf(source, signal)
  throwIfAborted(signal)
  if (image == null) return null
  const { default: jsQR } = await import('jsqr')
  throwIfAborted(signal)
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data || null
}

// Whether this page can put a camera on screen at all. getUserMedia exists only in a secure context,
// and a webview that has no camera permission plumbing leaves `mediaDevices` out entirely.
export function canScanQrInPage(): boolean {
  return globalThis.isSecureContext === true && typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function'
}
