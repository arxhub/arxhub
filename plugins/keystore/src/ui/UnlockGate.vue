<script setup lang="ts">
import { hasErrorCode } from '@arxhub/errors'
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { enableDeviceLock, isUnlockCodeValid, MIN_UNLOCK_CODE_LENGTH, resetDeviceKeyStore, unlockDeviceKeyStore } from '../device-lock'
import type { KeyStore } from '../keystore'
import PinEntry from './PinEntry.vue'

const props = defineProps<{
  inner: KeyStore
  // 'unlock' gates a device that is already locked. 'setup' is the mandatory first-run screen a build
  // with `requireLock` shows when there is no lock yet at all — see resolve-key-store.ts. There is
  // nothing to "forget" in setup mode, so it has no reset section.
  mode: 'unlock' | 'setup'
  // Called once with the store to boot on: the unlocked/newly-locked view, or the wiped store after a reset.
  onDone: (store: KeyStore) => void
}>()

const entry = useTemplateRef<{ focus: () => void }>('entry')
const code = ref('')
const confirmCode = ref('')
// Setup asks twice, one keypad at a time: two pads on screen at once is two places to look for the
// digit you just pressed.
const step = ref<'choose' | 'confirm'>('choose')
const error = ref<string | null>(null)
const busy = ref(false)
const confirmingReset = ref(false)

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
const codeValid = computed(() => isUnlockCodeValid(code.value))
const canSubmitSetup = computed(() => (step.value === 'choose' ? codeValid.value : confirmCode.value.length > 0))

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
    entry.value?.focus()
  }
}

async function submitSetup(): Promise<void> {
  if (busy.value) return
  error.value = null

  if (!codeValid.value) {
    error.value = `A lock code is at least ${MIN_UNLOCK_CODE_LENGTH} digits.`
    return
  }
  if (step.value === 'choose') {
    step.value = 'confirm'
    return
  }
  if (code.value !== confirmCode.value) {
    error.value = 'The two codes do not match.'
    confirmCode.value = ''
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

function backToChoose(): void {
  step.value = 'choose'
  confirmCode.value = ''
  error.value = null
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
          This device's keys will be encrypted at rest with a code of {{ MIN_UNLOCK_CODE_LENGTH }} digits or more.
          There is no way to recover it if you forget it; the recovery phrase in Security settings is the only way
          back in.
        </p>

        <PinEntry
          v-if="step === 'choose'"
          v-model="code"
          label="New lock code"
          :placeholder="`New code, ${MIN_UNLOCK_CODE_LENGTH}+ digits`"
          autocomplete="new-password"
          autofocus
          :disabled="busy"
          test-id="setup-lock-code"
          @submit="submit"
        />
        <PinEntry
          v-else
          v-model="confirmCode"
          label="Confirm lock code"
          placeholder="Enter it again"
          autocomplete="new-password"
          autofocus
          :disabled="busy"
          test-id="confirm-lock-code"
          @submit="submit"
        />

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <div class="row">
          <button class="submit" type="button" :disabled="busy || !canSubmitSetup" @click="submit">
            {{ busy ? 'Setting up…' : step === 'choose' ? 'Continue' : 'Set up device lock' }}
          </button>
          <button v-if="step === 'confirm'" class="link" type="button" :disabled="busy" @click="backToChoose">Back</button>
        </div>
      </template>

      <template v-else>
        <h1 class="title">Unlock ArxHub</h1>
        <!-- Said plainly because the gate is where it would be believed: the code makes a copy of this
             profile useless to whoever picked it up, and buys hours — not safety — against someone who
             came for this vault. See the scrypt note in @arxhub/crypto's kdf.ts. -->
        <p class="hint">
          The code encrypts this device's keys: it stops someone who ends up with a copy of this profile, not someone
          who came for your vault and can spend an afternoon on it.
        </p>

        <PinEntry
          ref="entry"
          v-model="code"
          label="Unlock code"
          placeholder="Unlock code"
          autocomplete="current-password"
          autofocus
          :disabled="busy || backoffActive"
          test-id="unlock-code"
          @submit="submit"
        />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row">
          <!-- The click must not take focus off the field: the pad is only up while the entry holds it. -->
          <button
            class="submit"
            type="button"
            :disabled="busy || code.length === 0 || backoffActive"
            @mousedown.prevent
            @click="submit"
          >
            {{ backoffActive ? `Try again in ${backoffRemaining}s` : busy ? 'Unlocking…' : 'Unlock' }}
          </button>
        </div>

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
  padding: 16px;
  background-color: var(--gray-1);
  font-family: var(--font-sans);
  overflow-y: auto;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 320px;
}

.title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.hint {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--gray-11);
}

.submit {
  height: var(--size-xl);
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background-color: var(--accent-9);
  color: var(--accent-contrast);
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  cursor: pointer;
}

.submit:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}

.submit:disabled {
  background-color: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}

.error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--danger-11);
}

.recover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--gray-6);
}

.warn {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  text-decoration: underline;
  cursor: pointer;
}

.danger {
  height: var(--size-xl);
  padding: 0 16px;
  border: 1px solid var(--danger-7);
  border-radius: var(--radius-xs);
  background-color: var(--gray-1);
  color: var(--danger-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  cursor: pointer;
}
</style>
