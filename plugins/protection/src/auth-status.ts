import { type AuthRejection, authRejections } from '@arxhub/crypto'
import { readonly, shallowRef } from 'vue'
import { t } from './i18n/messages'

// What the user is told for each reason the server can refuse a signed request with. Kept next to the
// state rather than inline in the footer's template so the wording is unit-testable and one unknown
// reason from a newer server cannot render a blank dialog.
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

type ReasonKey = 'unknownKey' | 'missing' | 'stale' | 'badSignature' | 'replay'

// Whether restoring the phrase is the fix is a fact about the reason, not wording, so it stays out of the catalog.
const REASONS: Record<string, { key: ReasonKey; offerPhrase: boolean }> = {
  'unknown-key': { key: 'unknownKey', offerPhrase: true },
  missing: { key: 'missing', offerPhrase: true },
  stale: { key: 'stale', offerPhrase: false },
  'bad-signature': { key: 'badSignature', offerPhrase: true },
  replay: { key: 'replay', offerPhrase: false },
}

function copyFor(key: ReasonKey, offerPhrase: boolean): RejectionCopy {
  return {
    label: t(`auth.${key}.label`),
    title: t(`auth.${key}.title`),
    detail: t(`auth.${key}.detail`),
    fix: t(`auth.${key}.fix`),
    offerPhrase,
  }
}

// A reason this build does not know about still gets a usable dialog: an unrecognised refusal is far
// more likely to be a key mismatch than anything else, so it borrows that copy and says so. Read on every
// call, so the copy follows a language switch.
export function describeRejection(reason: string | null): RejectionCopy {
  const unknownKey = copyFor('unknownKey', true)
  if (reason == null) return { ...unknownKey, title: t('auth.unknownReason'), fix: `${unknownKey.fix} ${t('auth.unknownReasonFix')}` }
  const known = REASONS[reason]
  return known ? copyFor(known.key, known.offerPhrase) : { ...unknownKey, title: t('auth.reasonTitle', { reason }) }
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
