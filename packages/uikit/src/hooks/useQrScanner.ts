import { onBeforeUnmount, onMounted, type Ref, ref } from 'vue'
import { t } from '../i18n/messages'
import { canScanQrInPage, decodeQr } from './decode-qr'

export interface UseQrScannerOptions {
  onDetected(text: string): void
  // Why there is no picture: no camera API here, the person refused it, or the device has none.
  onUnavailable?(reason: string): void
  // How often a frame is read. Five a second finds a code as fast as a person can hold one up.
  intervalMs?: number
}

export type QrScannerState = 'starting' | 'scanning' | 'unavailable' | 'stopped'

function reasonOf(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return t('camera.denied')
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('camera.none')
  if (name === 'NotReadableError') return t('camera.busy')
  return t('camera.failed')
}

// Puts the back camera into `video` while the component is mounted and reads a frame every
// `intervalMs` until one holds a QR code. The first code found is reported once and the camera is
// released: a scanner that keeps reporting would answer the same invitation twice.
export function useQrScanner(video: Ref<HTMLVideoElement | null>, options: UseQrScannerOptions): { state: Ref<QrScannerState> } {
  const state = ref<QrScannerState>('starting')
  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const reading = new AbortController()

  function stop(): void {
    stopped = true
    clearTimeout(timer)
    reading.abort()
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
    if (state.value !== 'unavailable') state.value = 'stopped'
  }

  function unavailable(reason: string): void {
    stop()
    state.value = 'unavailable'
    options.onUnavailable?.(reason)
  }

  async function tick(): Promise<void> {
    const element = video.value
    if (stopped || element == null) return
    let text: string | null = null
    try {
      if (element.readyState >= element.HAVE_CURRENT_DATA) text = await decodeQr(element, { signal: reading.signal })
    } catch {
      // A frame that could not be read is a miss; the next one is a fifth of a second away.
    }
    if (stopped) return
    if (text != null) {
      stop()
      options.onDetected(text)
      return
    }
    timer = setTimeout(() => void tick(), options.intervalMs ?? 200)
  }

  onMounted(async () => {
    if (!canScanQrInPage()) return unavailable(t('camera.unsupported'))
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    } catch (error) {
      return unavailable(reasonOf(error))
    }
    // Unmounted while the permission prompt was up.
    if (stopped || video.value == null) {
      for (const track of stream.getTracks()) track.stop()
      stream = null
      return
    }
    video.value.srcObject = stream
    try {
      await video.value.play()
    } catch {
      // Autoplay of a muted inline video is allowed everywhere we ship; a refusal still leaves frames.
    }
    if (stopped) return
    state.value = 'scanning'
    void tick()
  })

  onBeforeUnmount(stop)

  return { state }
}
