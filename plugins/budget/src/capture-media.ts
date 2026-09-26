import { validation } from '@arxhub/errors'
import { decodeQr } from '@arxhub/uikit/hooks'

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

const MAX_RECEIPT_PHOTO_SIZE = 10 * 1024 * 1024

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal)
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
  return decodeQr(blob, { signal })
}

export const browserBudgetCapture: BudgetCapture = {
  locate: locateInBrowser,
  scanReceiptPhoto: scanInBrowser,
}
