<script setup lang="ts">
import { hasErrorCode } from '@arxhub/errors'
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { enableDeviceLock, MIN_UNLOCK_CODE_LENGTH, resetDeviceKeyStore, unlockDeviceKeyStore } from '../device-lock'
import type { KeyStore } from '../keystore'

const props = defineProps<{
  inner: KeyStore
  // 'unlock' gates a device that is already locked. 'setup' is the mandatory first-run screen a build
  // with `requireLock` shows when there is no lock yet at all — see resolve-key-store.ts. There is
  // nothing to "forget" in setup mode, so it has no reset section.
  mode: 'unlock' | 'setup'
  // Called once with the store to boot on: the unlocked/newly-locked view, or the wiped store after a reset.
  onDone: (store: KeyStore) => void
}>()

const code = ref('')
const confirmCode = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const confirmingReset = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')

// A deterrent against someone guessing codes through THIS screen on a device they have physical or
// on-screen access to right now — not a defense against an offline attacker with a copy of the storage,
// who never goes through this UI at all and isn't slowed by anything here. The real defense against that
// is the KDF cost in @arxhub/crypto's kdf.ts; see MIN_UNLOCK_CODE_LENGTH's comment in device-lock.ts for
// why a short code alone doesn't rely on this lockout to be safe. Resets on reload by design — an
// attacker who can reload the page also isn't slowed by it, so persisting the counter would only cost a
// legitimate user who refreshes after mistyping a few times.
const FAILURES_BEFORE_BACKOFF = 3
const MAX_BACKOFF_SECONDS = 30
const failures = ref(0)
const backoffUntil = ref(0)
const backoffRemaining = ref(0)
let backoffTimer: ReturnType<typeof setInterval> | undefined

const backoffActive = computed(() => backoffRemaining.value > 0)

function startBackoff(): void {
  if (failures.value < FAILURES_BEFORE_BACKOFF) return
  const seconds = Math.min(2 ** (failures.value - FAILURES_BEFORE_BACKOFF), MAX_BACKOFF_SECONDS)
  backoffUntil.value = Date.now() + seconds * 1000
  backoffRemaining.value = seconds
  clearInterval(backoffTimer)
  backoffTimer = setInterval(() => {
    backoffRemaining.value = Math.max(0, Math.ceil((backoffUntil.value - Date.now()) / 1000))
    if (backoffRemaining.value === 0) clearInterval(backoffTimer)
  }, 250)
}

onBeforeUnmount(() => clearInterval(backoffTimer))

async function submitUnlock(): Promise<void> {
  if (busy.value || code.value.length === 0 || backoffActive.value) return
  busy.value = true
  error.value = null
  // Let the browser paint the pending state before scrypt blocks the main thread for ~130ms.
  await nextTick()

  try {
    const store = await unlockDeviceKeyStore(props.inner, code.value)
    failures.value = 0
    props.onDone(store)
  } catch (e) {
    // Anything that is not a failed unlock is a real fault and must not read as a typo.
    error.value = hasErrorCode(e, 'UnlockFailedError') ? 'That code did not work.' : `Could not unlock this device: ${String(e)}`
    if (hasErrorCode(e, 'UnlockFailedError')) {
      failures.value += 1
      startBackoff()
    }
    busy.value = false
    code.value = ''
    await nextTick()
    input.value?.focus()
  }
}

async function submitSetup(): Promise<void> {
  if (busy.value) return
  error.value = null

  if (code.value.length < MIN_UNLOCK_CODE_LENGTH) {
    error.value = `A lock code must be at least ${MIN_UNLOCK_CODE_LENGTH} characters.`
    return
  }
  if (code.value !== confirmCode.value) {
    error.value = 'The two codes do not match.'
    return
  }

  busy.value = true
  await nextTick()
  try {
    props.onDone(await enableDeviceLock(props.inner, code.value))
  } catch (e) {
    error.value = `Could not set up the lock: ${String(e)}`
    busy.value = false
  }
}

function submit(): Promise<void> {
  return props.mode === 'setup' ? submitSetup() : submitUnlock()
}

async function reset(): Promise<void> {
  busy.value = true
  try {
    await resetDeviceKeyStore(props.inner)
    props.onDone(props.inner)
  } catch (e) {
    error.value = `Could not reset this device: ${String(e)}`
    busy.value = false
  }
}
</script>

<template>
  <div class="gate">
    <!-- Deliberately not <main>: the app's own main landmark is what tells the rest of the suite (and
         a screen reader) that the app itself has come up, and the gate must not answer to that. -->
    <div class="card">
      <template v-if="mode === 'setup'">
        <h1 class="title">Set a lock code</h1>
        <p class="hint">
          This device's keys will be encrypted at rest. Choose a code you can remember — there is no way to recover
          it if you forget it; the recovery phrase in Security settings is the only way back in.
        </p>

        <form @submit.prevent="submit">
          <input
            ref="input"
            v-model="code"
            class="input"
            type="password"
            autocomplete="new-password"
            autofocus
            :disabled="busy"
            aria-label="New lock code"
            data-testid="setup-lock-code"
            placeholder="New lock code"
          />
          <input
            v-model="confirmCode"
            class="input"
            type="password"
            autocomplete="new-password"
            :disabled="busy"
            aria-label="Confirm lock code"
            placeholder="Confirm lock code"
          />
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button class="submit" type="submit" :disabled="busy || code.length === 0">
            {{ busy ? 'Setting up…' : 'Set up device lock' }}
          </button>
        </form>
      </template>

      <template v-else>
        <h1 class="title">Unlock ArxHub</h1>
        <p class="hint">This device's keys are encrypted. Enter your code to continue.</p>

        <form @submit.prevent="submit">
          <input
            ref="input"
            v-model="code"
            class="input"
            type="password"
            autocomplete="current-password"
            autofocus
            :disabled="busy || backoffActive"
            aria-label="Unlock code"
            placeholder="Unlock code"
          />
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button class="submit" type="submit" :disabled="busy || code.length === 0 || backoffActive">
            {{ backoffActive ? `Try again in ${backoffRemaining}s` : busy ? 'Unlocking…' : 'Unlock' }}
          </button>
        </form>

        <div class="recover">
          <button v-if="!confirmingReset" class="link" type="button" :disabled="busy" @click="confirmingReset = true">
            I forgot my code
          </button>
          <template v-else>
            <p class="warn">
              There is no way to recover a forgotten code — the keys cannot be read without it. Resetting erases this
              device's identity. Everything encrypted under it is lost unless you saved the recovery phrase, and this
              device will start again as a new one.
            </p>
            <div class="row">
              <button class="danger" type="button" :disabled="busy" @click="reset">Erase and start over</button>
              <button class="link" type="button" :disabled="busy" @click="confirmingReset = false">Cancel</button>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.gate {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: var(--gray-1, #fff);
  font-family: var(--font-sans, system-ui, sans-serif);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  max-width: 22rem;
}

.title {
  margin: 0;
  font-size: var(--font-size-lg, 1.125rem);
  font-weight: var(--font-weight-medium, 500);
  color: var(--gray-12, #111);
}

.hint {
  margin: 0;
  font-size: var(--font-size-xs, 0.8125rem);
  color: var(--gray-11, #666);
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--gray-7, #ccc);
  border-radius: var(--radius-sm, 4px);
  background: var(--gray-1, #fff);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--gray-12, #111);
}

/* The one focus treatment (.claude/rules/design.md), not a bespoke ring — this is the first screen a
   locked-out user sees and it must not look like a different product from the one behind it. */
.input:focus-visible {
  outline: 2px solid var(--accent-8, #2f6feb);
  outline-offset: -1px;
}

.submit {
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: var(--accent-9, #06f);
  color: var(--accent-contrast, #fff);
  font-size: var(--font-size-sm, 0.875rem);
  cursor: pointer;
}

.submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  margin: 0;
  font-size: var(--font-size-xs, 0.8125rem);
  color: var(--danger-11, #c00);
}

.recover {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--gray-6, #eee);
}

.warn {
  margin: 0;
  font-size: var(--font-size-xs, 0.8125rem);
  color: var(--gray-11, #666);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 0.5rem);
}

.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--gray-11, #666);
  font-size: var(--font-size-xs, 0.8125rem);
  text-decoration: underline;
  cursor: pointer;
}

.danger {
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--danger-7, #f99);
  border-radius: var(--radius-sm, 4px);
  background: none;
  color: var(--danger-11, #c00);
  font-size: var(--font-size-xs, 0.8125rem);
  cursor: pointer;
}
</style>
