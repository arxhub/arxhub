import { keyringFromMnemonic } from '@arxhub/crypto'
import { PairingHost, PairingJoiner } from '@arxhub/plugin-protection'

// The first device's half of pairing, driven from a page of the stand: Settings → Security's "Connect a
// device" drives the same PairingHost, so this is the protocol the joining screens will meet.
export interface HostHandle {
  code(): string | null
  sas(): string | null
  phase(): string
  confirm(): Promise<void>
  cancel(): Promise<void>
}

export function startPairingHost(mnemonic: string): HostHandle {
  const host = new PairingHost({ server: location.origin, keyring: keyringFromMnemonic(mnemonic), mnemonic, pollMs: 250 })
  void host.start()
  return {
    code: () => host.invitation.value?.code ?? null,
    sas: () => host.sas.value,
    phase: () => host.phase.value,
    confirm: () => host.confirm(),
    cancel: () => host.cancel(),
  }
}

// The new device's half, for the specs that drive Settings → Security's "Connect a device" as the host.
export interface JoinerHandle {
  sas(): string | null
  phase(): string
  payload(): { mnemonic: string; serverUrl: string } | null
  // The owner's "They match" on the new device.
  confirm(): void
}

export function startPairingJoiner(code: string): JoinerHandle {
  const joiner = new PairingJoiner({ server: location.origin, ref: code, deviceName: 'E2E phone', pollMs: 250 })
  let received: { mnemonic: string; serverUrl: string } | null = null
  void joiner.start().then(
    (payload) => (received = payload),
    () => {},
  )
  return {
    sas: () => joiner.sas.value,
    phase: () => joiner.phase.value,
    payload: () => received,
    confirm: () => joiner.confirm(),
  }
}
