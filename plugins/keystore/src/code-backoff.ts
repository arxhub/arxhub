import { computed, markRaw, type Ref, ref } from 'vue'
import { t } from './i18n/messages'

const FAILURES_BEFORE_BACKOFF = 3
const MAX_BACKOFF_SECONDS = 30
const TICK_MS = 250

export interface CodeBackoffOptions {
  now?: () => number
}

// A deterrent against someone guessing codes through the app on a device they have in hand right now —
// not a defense against an offline attacker with a copy of the storage, who never goes through this UI
// and isn't slowed by anything here (that is the KDF cost in @arxhub/crypto's kdf.ts). After three wrong
// codes every further one waits 2^n seconds, capped at 30. Held in memory only: an attacker who can
// reload the page is not slowed by a persisted counter either, and a legitimate user who refreshes after
// a few typos would be.
export class CodeBackoff {
  readonly failures = ref(0)
  readonly remaining: Ref<number> = ref(0)
  readonly active = computed(() => this.remaining.value > 0)

  private readonly now: () => number
  private until = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly endListeners = new Set<() => void>()

  constructor(options: CodeBackoffOptions = {}) {
    this.now = options.now ?? Date.now
    // Held in reactive state (a task's deps) it must stay itself: a proxy would unwrap its refs.
    markRaw(this)
  }

  // "Wrong code — try again in 4s" while a pause runs, else null.
  get message(): string | null {
    return this.active.value ? t('unlock.backoff', { seconds: this.remaining.value }) : null
  }

  fail(): void {
    this.failures.value += 1
    if (this.failures.value < FAILURES_BEFORE_BACKOFF) return
    const seconds = Math.min(2 ** (this.failures.value - FAILURES_BEFORE_BACKOFF), MAX_BACKOFF_SECONDS)
    this.until = this.now() + seconds * 1000
    this.remaining.value = seconds
    clearInterval(this.timer)
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  succeed(): void {
    this.failures.value = 0
    this.stop()
  }

  // Called each time a pause runs out — a screen whose field was disabled for it takes the focus back.
  onEnd(listener: () => void): () => void {
    this.endListeners.add(listener)
    return () => this.endListeners.delete(listener)
  }

  tick(): void {
    this.remaining.value = Math.max(0, Math.ceil((this.until - this.now()) / 1000))
    if (this.remaining.value > 0) return
    this.stop()
    for (const listener of this.endListeners) listener()
  }

  private stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.remaining.value = 0
  }
}

// One counter for every place the app asks for this device's code — the unlock gate and the re-entry in
// Settings → Security — so moving between them, or reopening a task, does not start the count again.
export const deviceCodeBackoff = new CodeBackoff()
