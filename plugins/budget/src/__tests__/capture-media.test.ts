import jsQR from 'jsqr'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { browserBudgetCapture } from '../capture-media'

vi.mock('jsqr', () => ({ default: vi.fn() }))

const mockedJsQr = vi.mocked(jsQR)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('browserBudgetCapture', () => {
  test('returns a browser position and asks for a quick cached result', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback, _failure?: PositionErrorCallback, options?: PositionOptions) => {
      success({ coords: { latitude: 54.71, longitude: 20.51, accuracy: 18 } } as GeolocationPosition)
      expect(options).toEqual({ enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 })
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    await expect(browserBudgetCapture.locate()).resolves.toEqual({ latitude: 54.71, longitude: 20.51, accuracy: 18 })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  test('an aborted location request ignores a later device callback', async () => {
    let success: PositionCallback | undefined
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (callback: PositionCallback) => (success = callback) },
    })
    const controller = new AbortController()
    const result = browserBudgetCapture.locate({ signal: controller.signal })
    controller.abort()
    success?.({ coords: { latitude: 1, longitude: 2, accuracy: 3 } } as GeolocationPosition)

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('uses BarcodeDetector for a QR receipt without decoding the bitmap twice', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: 't=20260919T1200&s=12.34&fn=1&i=2&fp=3&n=1' }])
    class Detector {
      static getSupportedFormats = vi.fn().mockResolvedValue(['qr_code'])
      detect = detect
    }
    vi.stubGlobal('BarcodeDetector', Detector)
    vi.stubGlobal('createImageBitmap', vi.fn())

    await expect(browserBudgetCapture.scanReceiptPhoto(new Blob(['photo'], { type: 'image/jpeg' }))).resolves.toContain('fn=1')
    expect(detect).toHaveBeenCalledOnce()
    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(mockedJsQr).not.toHaveBeenCalled()
  })

  test('falls back to bundled jsQR when BarcodeDetector cannot handle the image', async () => {
    class Detector {
      detect = vi.fn().mockRejectedValue(new Error('unsupported source'))
    }
    vi.stubGlobal('BarcodeDetector', Detector)
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2, height: 1, close }))
    const pixels = new Uint8ClampedArray(8)
    const getImageData = vi.fn().mockReturnValue({ data: pixels, width: 2, height: 1 })
    const drawImage = vi.fn()
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({ width: 0, height: 0, getContext: () => ({ drawImage, getImageData }) }),
    })
    mockedJsQr.mockReturnValue({ data: 'fiscal-qr', binaryData: [], chunks: [], location: {} } as never)

    await expect(browserBudgetCapture.scanReceiptPhoto(new Blob(['photo']))).resolves.toBe('fiscal-qr')
    expect(drawImage).toHaveBeenCalledOnce()
    expect(mockedJsQr).toHaveBeenCalledWith(pixels, 2, 1, { inversionAttempts: 'attemptBoth' })
    expect(close).toHaveBeenCalledOnce()
  })

  test('rejects an empty or oversized photo before invoking either decoder', async () => {
    const detect = vi.fn()
    class Detector {
      detect = detect
    }
    vi.stubGlobal('BarcodeDetector', Detector)
    vi.stubGlobal('createImageBitmap', vi.fn())

    await expect(browserBudgetCapture.scanReceiptPhoto(new Blob([]))).rejects.toThrow(/must not be empty/)
    const oversized = { size: 10 * 1024 * 1024 + 1 } as Blob
    await expect(browserBudgetCapture.scanReceiptPhoto(oversized)).rejects.toThrow(/up to 10 MB/)
    expect(detect).not.toHaveBeenCalled()
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
})
