import { type CodeBackoff, type CodeShape, isUnlockCodeValid, UNLOCK_CODE_LENGTH } from '@arxhub/plugin-keystore'
import { computed, type Ref, ref } from 'vue'
import { t } from '../i18n/messages'
import type { PairingHostPhase } from '../pairing/pairing-client'

// What a row of Settings → Security starts. Showing the phrase and connecting a device both hand out
// the vault key, so each asks for the code every time; changing the code asks for the current one as its
// first step, which is the same question.
export type SecurityTaskKind = 'phrase' | 'pair' | 'change-code' | 'lock' | 'remove-lock'

export type SecurityTaskStep =
  // A device with no lock has no code to ask for (the dev stand only): the owner confirms instead.
  'confirm' | 'reentry' | 'phrase' | 'pair' | 'new-code' | 'repeat-code' | 'applying'

export interface SecurityTaskDeps {
  locked: boolean
  codeShape: CodeShape
  // The same counter the unlock gate uses: re-entry here exists to stop whoever holds an unlocked
  // device, and without it this field would be the one place to sweep the codes at scrypt's speed.
  backoff: CodeBackoff
  verify(code: string): Promise<boolean>
  readPhrase(): Promise<string | null>
  changeCode(current: string, next: string): Promise<void>
  enableLock(code: string): Promise<void>
  disableLock(current: string): Promise<void>
}

// What the owner sees at the end of a task that rewrites the lock: the store the whole app reads its
// secrets from was resolved before boot, so applying it means reloading.
export type SecurityTaskOutcome = 'applied' | null

// The state behind one run of a Security task, with no DOM: which step is on screen, what the entry
// holds, and what went wrong. A task is thrown away when its surface closes, and `dispose` drops every
// secret it held, so nothing read for one showing outlives it.
export class SecurityTask {
  readonly step: Ref<SecurityTaskStep>
  readonly code = ref('')
  readonly error = ref<string | null>(null)
  // What the entry shows: the pause while one runs, else the last refusal.
  readonly shownError = computed(() => (this.step.value === 'reentry' ? this.deps.backoff.message : null) ?? this.error.value)
  readonly paused = computed(() => this.step.value === 'reentry' && this.deps.backoff.active.value)
  // Bumped on every refusal, so the entry shakes again on a second wrong code in a row.
  readonly refusals = ref(0)
  readonly busy = ref(false)
  readonly phrase = ref<string | null>(null)

  private readonly kind: SecurityTaskKind
  private readonly deps: SecurityTaskDeps
  private current: string | null = null
  private chosen: string | null = null

  constructor(kind: SecurityTaskKind, deps: SecurityTaskDeps) {
    this.kind = kind
    this.deps = deps
    this.step = ref(this.firstStep())
  }

  // How many digits the entry on screen takes, or null for a free-length entry: the current code of a
  // lock set before the six-digit rule, whose length nothing records.
  get codeLength(): number | null {
    if (this.step.value === 'reentry' && this.deps.codeShape === 'legacy') return null
    return UNLOCK_CODE_LENGTH
  }

  // The phrase, as the words the screen lays out.
  get words(): string[] {
    return this.phrase.value?.split(/\s+/).filter((word) => word !== '') ?? []
  }

  input(value: string): void {
    this.code.value = value
    if (value !== '') this.error.value = null
  }

  // The entry reached its length (or its confirm key was pressed). Resolves 'applied' once a lock change
  // has been written — the caller reloads — and null otherwise.
  async submit(): Promise<SecurityTaskOutcome> {
    if (this.busy.value) return null
    const code = this.code.value
    switch (this.step.value) {
      case 'reentry':
        return this.checkCurrent(code)
      case 'new-code':
        if (!isUnlockCodeValid(code)) return null
        this.chosen = code
        this.code.value = ''
        this.step.value = 'repeat-code'
        return null
      case 'repeat-code':
        if (code !== this.chosen) {
          this.chosen = null
          this.refuse(t('task.codesDiffer'))
          this.step.value = 'new-code'
          return null
        }
        return this.apply(code)
      default:
        return null
    }
  }

  // "Continue" on a device with no lock.
  async confirm(): Promise<SecurityTaskOutcome> {
    if (this.step.value !== 'confirm') return null
    return this.proceed()
  }

  // "Different code" on the repeat step.
  differentCode(): void {
    if (this.step.value !== 'repeat-code') return
    this.chosen = null
    this.code.value = ''
    this.error.value = null
    this.step.value = 'new-code'
  }

  // The screen showing the phrase was left, or the app went to the background: the words go.
  hidePhrase(): void {
    this.phrase.value = null
  }

  dispose(): void {
    this.phrase.value = null
    this.code.value = ''
    this.current = null
    this.chosen = null
  }

  private firstStep(): SecurityTaskStep {
    if (this.deps.locked) return this.kind === 'lock' ? 'new-code' : 'reentry'
    if (this.kind === 'lock') return 'new-code'
    return 'confirm'
  }

  private async checkCurrent(code: string): Promise<SecurityTaskOutcome> {
    if (code === '') return null
    if (this.deps.backoff.active.value) {
      this.code.value = ''
      return null
    }
    this.busy.value = true
    try {
      if (!(await this.deps.verify(code))) {
        this.deps.backoff.fail()
        this.refuse(t('task.wrongCode'))
        return null
      }
    } finally {
      this.busy.value = false
    }
    this.deps.backoff.succeed()
    this.current = code
    this.code.value = ''
    this.error.value = null
    return this.proceed()
  }

  private async proceed(): Promise<SecurityTaskOutcome> {
    switch (this.kind) {
      case 'phrase':
      case 'pair': {
        this.busy.value = true
        try {
          const stored = (await this.deps.readPhrase())?.trim() ?? ''
          if (stored === '') {
            this.error.value = t('task.noPhrase')
            return null
          }
          this.phrase.value = stored
        } finally {
          this.busy.value = false
        }
        this.step.value = this.kind
        return null
      }
      case 'change-code':
        this.step.value = 'new-code'
        return null
      case 'remove-lock':
        return this.run(() => this.deps.disableLock(this.current ?? ''))
      case 'lock':
        return null
    }
  }

  private apply(code: string): Promise<SecurityTaskOutcome> {
    if (this.kind === 'lock') return this.run(() => this.deps.enableLock(code))
    return this.run(() => this.deps.changeCode(this.current ?? '', code))
  }

  private async run(change: () => Promise<void>): Promise<SecurityTaskOutcome> {
    const back = this.step.value
    this.step.value = 'applying'
    this.busy.value = true
    try {
      await change()
      this.dispose()
      return 'applied'
    } catch (error) {
      this.step.value = back
      this.code.value = ''
      throw error
    } finally {
      this.busy.value = false
    }
  }

  private refuse(message: string): void {
    this.code.value = ''
    this.error.value = message
    this.refusals.value += 1
  }
}

// The invitation's time left, as the countdown line says it: "4:52".
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

// Which of the "Connect a device" screens a phase of the first device's pairing draws. Connecting is
// still the invitation screen: the new device has claimed it but the digits do not exist yet.
export type PairScreen = 'preparing' | 'invite' | 'compare' | 'done' | 'expired' | 'failed'

export function pairScreen(phase: PairingHostPhase): PairScreen {
  switch (phase) {
    case 'idle':
    case 'creating':
      return 'preparing'
    case 'waiting':
    case 'connecting':
      return 'invite'
    case 'compare':
    case 'sending':
      return 'compare'
    case 'done':
      return 'done'
    case 'expired':
      return 'expired'
    case 'cancelled':
    case 'failed':
      return 'failed'
  }
}
