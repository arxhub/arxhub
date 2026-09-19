import { validation } from '@arxhub/errors'
import { type BudgetCapture, type BudgetCaptureOptions, type BudgetPosition, browserBudgetCapture } from '@arxhub/plugin-budget/ui'
import { isTauri } from '@tauri-apps/api/core'

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

async function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) throw abortReason(signal)
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function validatePosition(position: BudgetPosition): BudgetPosition {
  if (
    !Number.isFinite(position.latitude) ||
    position.latitude < -90 ||
    position.latitude > 90 ||
    !Number.isFinite(position.longitude) ||
    position.longitude < -180 ||
    position.longitude > 180 ||
    !Number.isFinite(position.accuracy) ||
    position.accuracy < 0
  ) {
    throw validation('The device returned an invalid location')
  }
  return position
}

async function locate(options?: BudgetCaptureOptions): Promise<BudgetPosition> {
  if (!isTauri()) return browserBudgetCapture.locate(options)
  if (options?.signal?.aborted) throw abortReason(options.signal)
  const { platform } = await import('@tauri-apps/plugin-os')
  if (platform() !== 'android') return browserBudgetCapture.locate(options)

  const geolocation = await import('@tauri-apps/plugin-geolocation')
  let permissions = await abortable(geolocation.checkPermissions(), options?.signal)
  if (
    permissions.location === 'prompt' ||
    permissions.location === 'prompt-with-rationale' ||
    permissions.coarseLocation === 'prompt' ||
    permissions.coarseLocation === 'prompt-with-rationale'
  ) {
    permissions = await abortable(geolocation.requestPermissions(['location', 'coarseLocation']), options?.signal)
  }
  if (permissions.coarseLocation !== 'granted' && permissions.location !== 'granted') throw validation('Location permission was not granted')
  const position = await abortable(
    geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 }),
    options?.signal,
  )
  return validatePosition({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  })
}

export const appBudgetCapture: BudgetCapture = {
  locate,
  scanReceiptPhoto: (blob, options) => browserBudgetCapture.scanReceiptPhoto(blob, options),
}
