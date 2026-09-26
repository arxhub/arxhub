import { decodeQr } from '@arxhub/uikit/hooks'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { browserBudgetCapture } from '../capture-media'

// The decoding itself is uikit's and tested there; this file covers what budget adds around it.
vi.mock('@arxhub/uikit/hooks', () => ({ decodeQr: vi.fn() }))

const mockedDecodeQr = vi.mocked(decodeQr)

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

  test('reads the QR code of a receipt photo through the shared decoder', async () => {
    mockedDecodeQr.mockResolvedValue('t=20260919T1200&s=12.34&fn=1&i=2&fp=3&n=1')
    const photo = new Blob(['photo'], { type: 'image/jpeg' })

    await expect(browserBudgetCapture.scanReceiptPhoto(photo)).resolves.toContain('fn=1')
    expect(mockedDecodeQr).toHaveBeenCalledWith(photo, { signal: undefined })
  })

  test('rejects an empty or oversized photo before decoding it', async () => {
    await expect(browserBudgetCapture.scanReceiptPhoto(new Blob([]))).rejects.toThrow(/must not be empty/)
    const oversized = { size: 10 * 1024 * 1024 + 1 } as Blob
    await expect(browserBudgetCapture.scanReceiptPhoto(oversized)).rejects.toThrow(/up to 10 MB/)
    expect(mockedDecodeQr).not.toHaveBeenCalled()
  })
})
