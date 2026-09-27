import { t } from './i18n/messages'

type Phase = 'setup' | 'create' | 'configure' | 'start'

function isPhase(phase: string | null | undefined): phase is Phase {
  return phase === 'setup' || phase === 'create' || phase === 'configure' || phase === 'start'
}

// The phase in words rather than as the method name — `configure()` is the boot's vocabulary, not the
// owner's. Null for a phase this build has no word for, so a caller picks its own fallback.
export function phaseLabel(phase: string | null | undefined): string | null {
  return isPhase(phase) ? t(`phase.${phase}`) : null
}

// After "failed while …": an unknown phase is shown by its name rather than dropped.
export function phaseDuring(phase: string | null | undefined): string {
  return isPhase(phase) ? t(`phaseDuring.${phase}`) : String(phase)
}
