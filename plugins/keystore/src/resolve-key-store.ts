import { mountGate, type ShellFrame } from '@arxhub/uikit/hooks'
import { type CodeShape, getCodeShape } from './device-lock'
import type { KeyStore } from './keystore'
import UnlockGate from './ui/UnlockGate.vue'

export interface UnlockGateOptions {
  // After "Erase and connect again" has wiped the store. The default reloads the page; the entry flow
  // passes its own so it can forget where a first run had got to as well.
  onErased?: () => void
}

// The unlock screen over a locked store. Resolves with the unlocked view once the code opens it; an
// erase reloads the page instead, so that promise simply never settles.
export async function openUnlockGate(inner: KeyStore, frame: ShellFrame, options: UnlockGateOptions = {}): Promise<KeyStore> {
  // Read before the screen is up: it decides whether the sixth digit submits, and a screen that
  // changed its mind after the first keypress would be worse than one that waited a tick.
  const codeShape = await getCodeShape(inner)
  return openGate(inner, frame, 'unlock', codeShape, options)
}

// The mandatory "create a code" screen for a device that has no lock yet on a build that requires one.
export function openLockSetupGate(inner: KeyStore, frame: ShellFrame): Promise<KeyStore> {
  return openGate(inner, frame, 'setup', 'digits-6', {})
}

function openGate(
  inner: KeyStore,
  frame: ShellFrame,
  mode: 'unlock' | 'setup',
  codeShape: CodeShape,
  options: UnlockGateOptions,
): Promise<KeyStore> {
  return new Promise<KeyStore>((resolve) => {
    const gate = mountGate(
      UnlockGate,
      {
        inner,
        mode,
        codeShape,
        onErased: options.onErased,
        onDone: (store: KeyStore) => {
          gate.dispose()
          resolve(store)
        },
      },
      frame,
    )
  })
}
