<script setup lang="ts">
import { hasErrorCode } from '@arxhub/errors'
import { nextTick, ref, useTemplateRef } from 'vue'
import { resetDeviceKeyStore, unlockDeviceKeyStore } from '../device-lock'
import type { KeyStore } from '../keystore'

const props = defineProps<{
  inner: KeyStore
  // Called once with the store to boot on: the unlocked view, or the wiped store after a reset.
  onDone: (store: KeyStore) => void
}>()

const code = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const confirmingReset = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')

async function submit(): Promise<void> {
  if (busy.value || code.value.length === 0) return
  busy.value = true
  error.value = null
  // Let the browser paint the pending state before scrypt blocks the main thread for ~130ms.
  await nextTick()

  try {
    props.onDone(await unlockDeviceKeyStore(props.inner, code.value))
  } catch (e) {
    // Anything that is not a failed unlock is a real fault and must not read as a typo.
    error.value = hasErrorCode(e, 'UnlockFailedError') ? 'That code did not work.' : `Could not unlock this device: ${String(e)}`
    busy.value = false
    code.value = ''
    await nextTick()
    input.value?.focus()
  }
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
          :disabled="busy"
          aria-label="Unlock code"
          placeholder="Unlock code"
        />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="submit" type="submit" :disabled="busy || code.length === 0">
          {{ busy ? 'Unlocking…' : 'Unlock' }}
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

.input:focus {
  border-color: var(--accent-9, #06f);
  box-shadow: 0 0 0 1px var(--accent-a2, rgb(0 102 255 / 20%));
  outline: none;
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
