import { validation } from '@arxhub/errors'
import type { QrScanPort } from '@arxhub/plugin-protection'
import { isTauri } from '@tauri-apps/api/core'

async function onPhone(): Promise<boolean> {
  if (!isTauri()) return false
  const { platform } = await import('@tauri-apps/plugin-os')
  const name = platform()
  return name === 'android' || name === 'ios'
}

// The phone's own scanner, full screen over the webview. The plugin exists on Android and iOS only, so
// everywhere else this port answers "not here" and the join screens fall back to the page's camera or
// the typed code. Availability deliberately does not ask for the camera: the permission prompt belongs
// to the moment the person chose to scan, not to the first run's chooser.
export const appPairingScanner: QrScanPort = {
  available: onPhone,

  async scan(signal) {
    if (signal.aborted || !(await onPhone())) return null
    const scanner = await import('@tauri-apps/plugin-barcode-scanner')
    let permission = await scanner.checkPermissions()
    if (permission !== 'granted' && permission !== 'denied') permission = await scanner.requestPermissions()
    if (permission !== 'granted') throw validation('Camera access was denied — enter the code instead')
    if (signal.aborted) return null

    const onAbort = () => void scanner.cancel().catch(() => {})
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      const result = await scanner.scan({ windowed: false, formats: [scanner.Format.QRCode] })
      return signal.aborted ? null : result.content
    } catch (error) {
      // Backing out of the scanner (or the cancel above) rejects; that is "nothing scanned", not a failure.
      if (signal.aborted || /cancel/i.test(String(error))) return null
      throw error
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  },
}
