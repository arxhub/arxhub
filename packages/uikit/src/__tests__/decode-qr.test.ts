import jsQR from 'jsqr'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { canScanQrInPage, decodeQr, resetQrDetector } from '../hooks/decode-qr'

vi.mock('jsqr', () => ({ default: vi.fn() }))

const mockedJsQr = vi.mocked(jsQR)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  resetQrDetector()
})

function stubCanvas() {
  const pixels = new Uint8ClampedArray(8)
  const getImageData = vi.fn().mockReturnValue({ data: pixels, width: 2, height: 1 })
  const drawImage = vi.fn()
  vi.stubGlobal('document', {
    createElement: vi.fn().mockReturnValue({ width: 0, height: 0, getContext: () => ({ drawImage, getImageData }) }),
  })
  return { pixels, drawImage }
}

describe('decodeQr', () => {
  test('uses BarcodeDetector without decoding the picture a second time', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: 'arxhub://pair?v=1' }])
    class Detector {
      static getSupportedFormats = vi.fn().mockResolvedValue(['qr_code'])
      detect = detect
    }
    vi.stubGlobal('BarcodeDetector', Detector)
    vi.stubGlobal('createImageBitmap', vi.fn())

    await expect(decodeQr(new Blob(['photo'], { type: 'image/jpeg' }))).resolves.toBe('arxhub://pair?v=1')
    expect(detect).toHaveBeenCalledOnce()
    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(mockedJsQr).not.toHaveBeenCalled()
  })

  test('keeps one detector for every frame it is asked about', async () => {
    const constructed = vi.fn()
    class Detector {
      static getSupportedFormats = vi.fn().mockResolvedValue(['qr_code'])
      constructor() {
        constructed()
      }
      detect = vi.fn().mockResolvedValue([{ rawValue: 'x' }])
    }
    vi.stubGlobal('BarcodeDetector', Detector)

    await decodeQr(new Blob(['a']))
    await decodeQr(new Blob(['b']))
    expect(constructed).toHaveBeenCalledOnce()
    expect(Detector.getSupportedFormats).toHaveBeenCalledOnce()
  })

  test('falls back to bundled jsQR when BarcodeDetector cannot handle the input', async () => {
    class Detector {
      detect = vi.fn().mockRejectedValue(new Error('unsupported source'))
    }
    vi.stubGlobal('BarcodeDetector', Detector)
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2, height: 1, close }))
    const { pixels, drawImage } = stubCanvas()
    mockedJsQr.mockReturnValue({ data: 'fiscal-qr', binaryData: [], chunks: [], location: {} } as never)

    await expect(decodeQr(new Blob(['photo']))).resolves.toBe('fiscal-qr')
    expect(drawImage).toHaveBeenCalledOnce()
    expect(mockedJsQr).toHaveBeenCalledWith(pixels, 2, 1, { inversionAttempts: 'attemptBoth' })
    expect(close).toHaveBeenCalledOnce()
  })

  test('a platform without BarcodeDetector goes straight to jsQR, and a miss is null', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2, height: 1, close: vi.fn() }))
    stubCanvas()
    mockedJsQr.mockReturnValue(null)

    await expect(decodeQr(new Blob(['photo']))).resolves.toBeNull()
    expect(mockedJsQr).toHaveBeenCalledOnce()
  })

  test('an aborted decode rejects rather than answering', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(decodeQr(new Blob(['photo']), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('canScanQrInPage', () => {
  test('needs a secure context and getUserMedia', () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } })
    expect(canScanQrInPage()).toBe(true)
    vi.stubGlobal('isSecureContext', false)
    expect(canScanQrInPage()).toBe(false)
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {})
    expect(canScanQrInPage()).toBe(false)
  })
})
