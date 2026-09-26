import { Extension } from '@arxhub/core'
import { type Ref, ref } from 'vue'

// Which server this device syncs through, as far as pairing is concerned. Sync owns that setting and
// already depends on protection, so it pushes the address here rather than protection reading sync's
// config (which would be a cycle). Null means there is no server, and so nothing to pair through.
export class PairingExtension extends Extension {
  readonly server: Ref<string | null> = ref(null)

  setServer(url: string | null): void {
    this.server.value = url || null
  }
}

// A camera that reads one QR code: the native scanner on a phone, supplied by the instance, since the
// plugin cannot import Tauri. `scan` resolves null when the person backs out or the signal aborts.
export interface QrScanPort {
  available(): Promise<boolean>
  scan(signal: AbortSignal): Promise<string | null>
}
