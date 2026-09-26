<script setup lang="ts">
import { Button, GateLayout } from '@arxhub/uikit/core'
import { nextTick, ref, watch } from 'vue'
import { enableDeviceLock, UNLOCK_CODE_LENGTH } from '../device-lock'
import type { KeyStore } from '../keystore'
import PinEntry from './PinEntry.vue'

// "Create a code", as a whole gate screen: the mandatory lock setup on a device from before the first-run
// flow, and the code step of that flow (a new vault, a device joining one). Both lock the same empty or
// plaintext store the same way, so there is one screen for it.
const props = defineProps<{
  // The store to lock — plaintext, or empty on a first run.
  inner: KeyStore
  // "Step 1 of 4" inside the first-run flow; nothing on the standalone setup screen.
  kicker?: string
  // Called once with the locked view of the store.
  onDone: (store: KeyStore) => void
  // Offered on the first stage only: once the code is being repeated, stepping back means another code.
  onBack?: () => void
}>()

const code = ref('')
const confirmCode = ref('')
// Asked twice, one keypad at a time: two pads on screen at once is two places to look for the digit you
// just pressed.
const step = ref<'choose' | 'confirm'>('choose')
const error = ref<string | null>(null)
const invalid = ref(false)
const busy = ref(false)

watch([code, confirmCode], ([value, confirm]) => {
  if (value.length === 0 && confirm.length === 0) return
  invalid.value = false
  error.value = null
})

async function submit(): Promise<void> {
  if (busy.value) return
  if (step.value === 'choose') {
    if (code.value.length !== UNLOCK_CODE_LENGTH) return
    error.value = null
    step.value = 'confirm'
    return
  }
  if (code.value !== confirmCode.value) {
    confirmCode.value = ''
    await nextTick()
    error.value = "The codes don't match — try again"
    invalid.value = true
    return
  }

  busy.value = true
  // Let the pending state paint before scrypt holds the main thread.
  await nextTick()
  try {
    props.onDone(await enableDeviceLock(props.inner, code.value))
  } catch (e) {
    error.value = `Could not set up the lock: ${String(e)}`
    invalid.value = true
    busy.value = false
  }
}

function differentCode(): void {
  step.value = 'choose'
  code.value = ''
  confirmCode.value = ''
  error.value = null
  invalid.value = false
}
</script>

<template>
  <GateLayout>
    <template v-if="kicker" #kicker>{{ kicker }}</template>
    <template #title>{{ step === 'choose' ? 'Create a code' : 'Repeat the code' }}</template>
    <template #text>
      {{ step === 'choose' ? '6 digits. The code protects the key on this device — it cannot be recovered.' : "So you don't mistype it" }}
    </template>

    <PinEntry
      v-if="step === 'choose'"
      key="choose"
      v-model="code"
      label="New code"
      :length="UNLOCK_CODE_LENGTH"
      autocomplete="new-password"
      autofocus
      :disabled="busy"
      :error="error"
      :invalid="invalid"
      test-id="setup-lock-code"
      @submit="submit"
    />
    <PinEntry
      v-else
      key="confirm"
      v-model="confirmCode"
      label="Repeat the code"
      :length="UNLOCK_CODE_LENGTH"
      autocomplete="new-password"
      autofocus
      :disabled="busy"
      :error="error"
      :invalid="invalid"
      test-id="confirm-lock-code"
      @submit="submit"
    />

    <template v-if="step === 'confirm' || onBack" #actions>
      <Button v-if="step === 'confirm'" block variant="ghost" :disabled="busy" @click="differentCode">Different code</Button>
      <Button v-else block variant="ghost" icon="lu:chevron-left" :disabled="busy" @click="onBack?.()">Back</Button>
    </template>
  </GateLayout>
</template>
