import { SHELL_FRAME_KEY, type ShellFrame } from '@arxhub/uikit/hooks'
import { createApp } from 'vue'
import { isDeviceLocked } from './device-lock'
import { type KeyStore, LocalStorageKeyStore, type StorageLike } from './keystore'
import UnlockGate from './ui/UnlockGate.vue'

export interface ResolveKeyStoreOptions {
  storage?: StorageLike
  // The unlock gate mounts before the shell exists, so the composition root passes the SAME frame the
  // eventual shell will use. Direct callers keep the historical desktop default.
  frame?: ShellFrame
  // A shipped, user-facing build never boots with its secrets in the clear — see the `12-keystore`
  // decision to make the lock mandatory. Dev/e2e leave this unset on purpose: they seed a plaintext
  // identity directly into storage before the app ever runs (see e2e/tests/fixtures.ts) and must come
  // straight up with no interaction, so only `instances/app` and `instances/client` set it.
  requireLock?: boolean
}

// The store an instance should boot on. Call this at the composition root, before the identity is
// resolved and before ArxHub.start() — everything downstream (the signer, sync's content key) reads
// secrets out of whatever this returns, so the unlock (or the mandatory first-run setup) has to have
// already happened.
//
// A locked device always gates on the unlock screen. An unlocked one either boots straight through (the
// historical, still-opt-in behavior) or, when `requireLock` is set, gates on a first-run "set a lock
// code" screen instead — there is no third option to boot with secrets in the clear on a build that
// requires the lock.
export async function resolveKeyStore(options: ResolveKeyStoreOptions = {}): Promise<KeyStore> {
  const inner = new LocalStorageKeyStore(options.storage)
  const frame = options.frame ?? 'desktop'
  if (await isDeviceLocked(inner)) return promptGate(inner, 'unlock', frame)
  if (options.requireLock) return promptGate(inner, 'setup', frame)
  return inner
}

function promptGate(inner: KeyStore, mode: 'unlock' | 'setup', frame: ShellFrame): Promise<KeyStore> {
  return new Promise<KeyStore>((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp(UnlockGate, {
      inner,
      mode,
      onDone: (store: KeyStore) => {
        app.unmount()
        host.remove()
        resolve(store)
      },
    })
    app.provide(SHELL_FRAME_KEY, frame)
    app.mount(host)
  })
}
