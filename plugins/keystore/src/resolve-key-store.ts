import { createApp } from 'vue'
import { isDeviceLocked } from './device-lock'
import { type KeyStore, LocalStorageKeyStore, type StorageLike } from './keystore'
import UnlockGate from './ui/UnlockGate.vue'

// The store an instance should boot on. Call this at the composition root, before the identity is
// resolved and before ArxHub.start() — everything downstream (the signer, sync's content key) reads
// secrets out of whatever this returns, so the unlock has to have already happened.
//
// When the device is not locked this is just the plaintext localStorage store, unchanged. When it is,
// this mounts its own tiny Vue app and does not resolve until the user supplies the right code (or
// erases the device), because there is nothing sensible to boot with in the meantime.
export async function resolveKeyStore(storage?: StorageLike): Promise<KeyStore> {
  const inner = new LocalStorageKeyStore(storage)
  if (!(await isDeviceLocked(inner))) return inner
  return promptUnlock(inner)
}

function promptUnlock(inner: KeyStore): Promise<KeyStore> {
  return new Promise<KeyStore>((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp(UnlockGate, {
      inner,
      onDone: (store: KeyStore) => {
        app.unmount()
        host.remove()
        resolve(store)
      },
    })
    app.mount(host)
  })
}
