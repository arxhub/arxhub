import type { Keyring } from '@arxhub/crypto'
import { isDeviceLocked, type KeyStore, LocalStorageKeyStore, type StorageLike } from '@arxhub/plugin-keystore'
import { openLockSetupGate, openUnlockGate } from '@arxhub/plugin-keystore/ui'
import { canScanQrInPage, mountGate, type ShellFrame } from '@arxhub/uikit/hooks'
import { markRaw } from 'vue'
import { hasIdentity, loadKeyring } from '../identity'
import { PairingJoiner } from '../pairing/pairing-client'
import type { QrScanPort } from '../pairing-extension'
import EntryFlowView from '../ui/entry/EntryFlow.vue'
import { describeThisDevice } from './device-name'
import { decideAfterUnlock, decideEntry } from './entry-decision'
import { type EntryCamera, EntryFlow, type EntryFlowResult, type EntryServer } from './entry-flow'
import { type EntryRecord, EntryRecordStore, type NewVaultStep } from './entry-record'
import { inspectServer } from './server-check'

export interface ResolveDeviceEntryOptions {
  // Chosen once by the instance; every screen here is mounted before the shell that would provide it.
  frame: ShellFrame
  // A shipped build never boots with its secrets in the clear (A-18).
  requireLock: boolean
  server: EntryServer
  // A camera the native app brings for the join flow's QR; without one the page's own camera is used
  // where the browser offers it, and the typed code everywhere.
  scanner?: QrScanPort
  storage?: StorageLike
}

export interface DeviceEntry {
  keystore: KeyStore
  keyring: Keyring
  // What the first run left for the plugins to finish — a server for sync to adopt — or null.
  entry: EntryRecord | null
}

// Everything that has to happen before the app exists: the unlock, the first run's chooser and new
// vault, the resume of one cut short. Ends with the identity loaded, because the signer is installed
// from it before the first request a plugin makes.
export async function resolveDeviceEntry(options: ResolveDeviceEntryOptions): Promise<DeviceEntry> {
  const inner = new LocalStorageKeyStore(options.storage)
  const records = new EntryRecordStore(options.storage)
  const record = records.read()
  const locked = await isDeviceLocked(inner)
  const decision = decideEntry({ locked, hasIdentity: !locked && (await hasIdentity(inner)), record, requireLock: options.requireLock })

  let result: EntryFlowResult
  switch (decision.kind) {
    case 'boot':
      result = { store: inner, entry: record }
      break
    case 'setup-lock':
      result = { store: await openLockSetupGate(inner, options.frame), entry: record }
      break
    case 'first-run':
      records.clear()
      result = await runFlow(options, records, inner, false, null)
      break
    case 'resume':
      result = await runFlow(options, records, inner, false, decision.step)
      break
    case 'unlock': {
      // An erase forgets how far a first run had got too: the next boot is a device that holds nothing.
      const store = await openUnlockGate(inner, options.frame, {
        onErased: () => {
          records.clear()
          window.location.reload()
        },
      })
      const after = decideAfterUnlock({ hasIdentity: await hasIdentity(store), record })
      if (after.kind === 'boot') {
        result = { store, entry: record }
      } else if (after.kind === 'resume') {
        result = await runFlow(options, records, store, true, after.step)
      } else {
        records.clear()
        result = await runFlow(options, records, store, true, null)
      }
      break
    }
  }

  return { keystore: result.store, keyring: await loadKeyring(result.store), entry: result.entry }
}

async function runFlow(
  options: ResolveDeviceEntryOptions,
  records: EntryRecordStore,
  store: KeyStore,
  locked: boolean,
  resume: NewVaultStep | null,
): Promise<EntryFlowResult> {
  let settle: (result: EntryFlowResult) => void = () => {}
  const settled = new Promise<EntryFlowResult>((resolve) => {
    settle = resolve
  })
  // Raw: the flow holds its own refs, and a reactive proxy around it would unwrap them under the screens.
  const flow = markRaw(
    new EntryFlow({
      records,
      store,
      locked,
      server: options.server,
      inspect: inspectServer,
      joiner: (joinerOptions) => new PairingJoiner(joinerOptions),
      camera: await cameraOf(options.scanner),
      scanner: options.scanner,
      deviceName: describeThisDevice(globalThis.navigator?.userAgent ?? ''),
      onDone: (result) => settle(result),
    }),
  )
  // Before the mount, so a resumed first run opens on its own screen rather than flashing the chooser.
  if (resume != null) await flow.resume(resume)
  const gate = mountGate(EntryFlowView, { flow, inner: store }, options.frame)
  const result = await settled
  gate.dispose()
  return result
}

// Asked once, before the chooser is on screen, so the join screens never offer a road and then take it
// away. The native scanner answers for a phone; everything else has the page's camera or none.
async function cameraOf(scanner: QrScanPort | undefined): Promise<EntryCamera> {
  try {
    if (scanner != null && (await scanner.available())) return 'native'
  } catch {
    // A scanner that cannot say is one that is not there.
  }
  return canScanQrInPage() ? 'page' : null
}
