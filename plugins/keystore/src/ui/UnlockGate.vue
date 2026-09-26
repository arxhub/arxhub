<script setup lang="ts">
import { hasErrorCode } from '@arxhub/errors'
import { Button, GateLayout } from '@arxhub/uikit/core'
import { toaster, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { deviceCodeBackoff } from '../code-backoff'
import { type CodeShape, resetDeviceKeyStore, UNLOCK_CODE_LENGTH, unlockDeviceKeyStore } from '../device-lock'
import type { KeyStore } from '../keystore'
import CreateCode from './CreateCode.vue'
import ForgotCode from './ForgotCode.vue'
import PinEntry from './PinEntry.vue'

const props = defineProps<{
  inner: KeyStore
  // 'unlock' gates a device that is already locked. 'setup' is the mandatory screen a build with
  // `requireLock` shows when a device from before the first-run flow has no lock yet — see
  // resolve-key-store.ts. There is nothing to "forget" in setup mode, so it has no recovery section.
  mode: 'unlock' | 'setup'
  // How the unlock takes the code: on the sixth digit, or — for a lock set before the six-digit rule —
  // with a confirm key.
  codeShape: CodeShape
  // Called once with the store to boot on: the unlocked or newly locked view.
  onDone: (store: KeyStore) => void
  // After "Erase and connect again" has wiped the store. Left out, the page reloads and the next boot
  // starts from a device that holds nothing.
  onErased?: () => void
}>()

const touch = useShellFrame() === 'mobile'
const entry = useTemplateRef<{ focus: () => void }>('entry')
const code = ref('')
const error = ref<string | null>(null)
const invalid = ref(false)
const busy = ref(false)
const forgotOpen = ref(false)
const eraseError = ref<string | null>(null)

const fixedLength = computed(() => (props.codeShape === 'digits-6' ? UNLOCK_CODE_LENGTH : undefined))

const backoff = deviceCodeBackoff
const backoffActive = backoff.active
const shownError = computed(() => backoff.message ?? error.value)

// The next digit is a new attempt: the refusal of the last one is no longer what the screen is about.
watch(code, (value) => {
  if (value.length === 0) return
  invalid.value = false
  if (!backoffActive.value) error.value = null
})

// The field was disabled for the pause, which took the focus with it.
const stopListening = backoff.onEnd(() => void nextTick(() => entry.value?.focus()))
onBeforeUnmount(stopListening)

async function submitUnlock(): Promise<void> {
  if (busy.value || code.value.length === 0 || backoffActive.value) return
  busy.value = true
  error.value = null
  // Let the browser paint the pending state before scrypt blocks the main thread for ~130ms.
  await nextTick()

  const attempt = code.value
  try {
    const store = await unlockDeviceKeyStore(props.inner, attempt)
    backoff.succeed()
    // Said after the door is open: a longer code still works, it only keeps the confirm key. The toaster
    // is a store, so the shell's Toaster shows it when it mounts a moment later.
    if (attempt.length > UNLOCK_CODE_LENGTH) {
      toaster.create({ title: 'Your code is longer than 6 digits — change it in Settings → Security', type: 'info' })
    }
    props.onDone(store)
  } catch (e) {
    const wrong = hasErrorCode(e, 'UnlockFailedError')
    // Anything that is not a failed unlock is a real fault and must not read as a typo.
    error.value = wrong ? 'Wrong code' : `Could not unlock this device: ${String(e)}`
    invalid.value = true
    if (wrong) backoff.fail()
    busy.value = false
    code.value = ''
    await nextTick()
    entry.value?.focus()
  }
}

async function erase(): Promise<void> {
  busy.value = true
  eraseError.value = null
  try {
    await resetDeviceKeyStore(props.inner)
    if (props.onErased) props.onErased()
    else window.location.reload()
  } catch (e) {
    eraseError.value = `Could not erase this device: ${String(e)}`
    busy.value = false
  }
}
</script>

<template>
  <CreateCode v-if="mode === 'setup'" :inner="inner" :on-done="onDone" />

  <GateLayout v-else center anchor="end" mark="lu:lock">
    <template #title>ArxHub</template>
    <template v-if="!touch" #text>Enter this device's code</template>

    <PinEntry
      ref="entry"
      v-model="code"
      label="Unlock code"
      :length="fixedLength"
      confirm-label="Unlock"
      autocomplete="current-password"
      autofocus
      :disabled="busy || backoffActive"
      :error="shownError"
      :invalid="invalid"
      test-id="unlock-code"
      @submit="submitUnlock"
    />

    <template #recovery>
      <Button block variant="ghost" :disabled="busy" @click="forgotOpen = true">Forgot the code?</Button>
    </template>
  </GateLayout>

  <ForgotCode v-if="mode === 'unlock'" :open="forgotOpen" :busy="busy" :error="eraseError" @close="forgotOpen = false" @erase="erase" />
</template>
