import { type AuthRejection, authRejections } from '@arxhub/crypto'
import { readonly, shallowRef } from 'vue'

// What the user is told for each reason the server can refuse a signed request with. Kept as data next
// to the state rather than inline in the footer's template so the wording is unit-testable and one
// unknown reason from a newer server cannot render a blank dialog.
export interface RejectionCopy {
  // Status-bar label — short enough for a 32px strip.
  label: string
  title: string
  // What happened, in one sentence.
  detail: string
  // What to do about it. Empty when there is nothing the user can usefully do.
  fix: string
  // Whether restoring the recovery phrase is the fix, i.e. whether to offer Security settings.
  offerPhrase: boolean
}

const UNKNOWN_KEY: RejectionCopy = {
  label: 'Device not paired',
  title: 'The server does not recognise this device',
  detail:
    'Requests are signed with this device’s identity, and the server is pinned to a different key. It refuses everything — the file tree, settings, sync — not just what you last tried.',
  fix: 'Restore this device’s recovery phrase, or clear the pinned key on the server (delete state/protection/pinned-key in its data directory and restart it) to pair with this device instead.',
  offerPhrase: true,
}

const COPY: Record<string, RejectionCopy> = {
  'unknown-key': UNKNOWN_KEY,
  missing: {
    label: 'No identity',
    title: 'Requests are going out unsigned',
    detail: 'No device identity was installed, so the server has nothing to authenticate and refuses every request.',
    fix: 'Reload the app. If it keeps happening, restore this device’s recovery phrase.',
    offerPhrase: true,
  },
  stale: {
    label: 'Clock out of sync',
    title: 'This device’s clock disagrees with the server',
    detail:
      'A signature is only accepted inside a short freshness window, and this device’s clock is outside the server’s. Every request is refused as too old or too far ahead.',
    fix: 'Correct the clock on this device or on the server — enabling automatic time on both is usually enough.',
    offerPhrase: false,
  },
  'bad-signature': {
    label: 'Signature refused',
    title: 'The server could not verify this device’s signature',
    detail:
      'The signature did not match what the server computed for the request. Something between the two is altering requests, or the identity is damaged.',
    fix: 'If a proxy sits in front of the server, check that it forwards the Host header and the request body unchanged.',
    offerPhrase: true,
  },
  replay: {
    label: 'Request refused',
    title: 'The server saw this request twice',
    detail: 'Each signed request may be sent once. The server had already seen this one, so it refused the repeat.',
    fix: 'Reload the app and try again.',
    offerPhrase: false,
  },
}

// A reason this build does not know about still gets a usable dialog: an unrecognised refusal is far
// more likely to be a key mismatch than anything else, so it borrows that copy and says so.
export function describeRejection(reason: string | null): RejectionCopy {
  if (reason == null)
    return {
      ...UNKNOWN_KEY,
      title: 'The server refused this device',
      fix: `${UNKNOWN_KEY.fix} Check the server log for the reason it recorded.`,
    }
  return COPY[reason] ?? { ...UNKNOWN_KEY, title: `The server refused this device (${reason})` }
}

const rejection = shallowRef<AuthRejection | null>(null)

// Started explicitly from ProtectionPlugin.create() rather than on import: this package is
// `sideEffects: false`, so a subscription at module scope is something a bundler is entitled to drop
// when only describeRejection() is reached.
//
// `onFirst` runs for the FIRST refusal only, which is what keeps the announcement from re-interrupting:
// a server that refuses this identity refuses every later request the same way, so the ones after it say
// nothing new.
export function watchAuthRejections(onFirst?: (rejection: AuthRejection) => void): () => void {
  return authRejections.subscribe((next) => {
    // Also why the first one is the one KEPT: overwriting would replace the reason that explains the
    // session with whatever request happened to fail most recently.
    if (rejection.value != null) return
    rejection.value = next
    onFirst?.(next)
  })
}

// Nothing clears `rejection`. It is a standing condition, not an event: both fixes leave this session
// behind — restoring the phrase reloads the app (see SecuritySettingsPage) and clearing the server's pin
// happens on the server — so anything that reset it would only make the indicator flicker.
export const authStatus = {
  rejection: readonly(rejection),
}
