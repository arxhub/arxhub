<script setup lang="ts">
import type { Keyring } from '@arxhub/crypto'
import { Button, ModalSurface } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { PairingHost } from '../../pairing/pairing-client'
import { pairScreen, SecurityTask, type SecurityTaskDeps, type SecurityTaskKind } from '../../security/security-task'
import CodeStep from './CodeStep.vue'
import PairDeviceFlow from './PairDeviceFlow.vue'
import RecoveryPhraseView from './RecoveryPhraseView.vue'

// One run of a Security task, from the code asked for again to its outcome, on the frame's modal surface.
// It lives exactly as long as it is on screen: closing it drops the phrase, the codes and the invitation.
const props = defineProps<{
  kind: SecurityTaskKind
  deps: SecurityTaskDeps
  // Where pairing goes through; the row that starts pairing is not offered without one.
  server: string | null
  keyring: Keyring | null
}>()
const emit = defineEmits<{ close: []; applied: [] }>()

const task = new SecurityTask(props.kind, props.deps)
const step = task.step
const host = shallowRef<PairingHost | null>(null)

const REENTRY_TEXT: Record<SecurityTaskKind, string> = {
  phrase: 'To show the recovery phrase.',
  pair: 'To show the connection QR — it hands out the vault key.',
  'change-code': "This device's current code.",
  'remove-lock': 'To remove the lock from this device.',
  lock: '',
}

const CONFIRM_TEXT: Partial<Record<SecurityTaskKind, string>> = {
  phrase: 'This device has no lock, so there is no code to ask for. Make sure nobody can see your screen.',
  pair: 'This device has no lock, so there is no code to ask for. The QR hands out the vault key to whoever scans it first.',
}

const NEW_CODE_TEXT =
  '6 digits. It stops whoever ends up with a copy of this profile, not someone who came for your vault and can spend an afternoon on it.'

const pairShown = computed(() => (host.value == null ? 'preparing' : pairScreen(host.value.phase.value)))

const title = computed(() => {
  switch (step.value) {
    case 'confirm':
      return props.kind === 'pair' ? 'Connect a device' : 'Show recovery phrase'
    case 'reentry':
      return 'Enter the code'
    case 'phrase':
      return 'Recovery phrase'
    case 'new-code':
      return props.kind === 'lock' ? 'Create a code' : 'New code'
    case 'repeat-code':
      return 'Repeat the code'
    case 'applying':
      return props.kind === 'remove-lock' ? 'Removing the lock…' : 'Saving the code…'
    case 'pair':
      switch (pairShown.value) {
        case 'compare':
          return 'Compare the digits'
        case 'done':
          return 'Device connected'
        case 'expired':
          return 'The invitation expired'
        case 'failed':
          return 'Not connected'
        default:
          return 'Connect a device'
      }
  }
  return 'Security'
})

function report(error: unknown, title: string): void {
  toaster.create({ title, description: error instanceof Error ? error.message : String(error), type: 'error' })
}

async function submit(): Promise<void> {
  try {
    if ((await task.submit()) === 'applied') emit('applied')
  } catch (error) {
    report(error, props.kind === 'remove-lock' ? 'Could not remove the lock' : 'Could not change the code')
  }
}

async function confirm(): Promise<void> {
  try {
    if ((await task.confirm()) === 'applied') emit('applied')
  } catch (error) {
    report(error, 'Could not continue')
  }
}

function run(action: Promise<void>, title: string): void {
  action.catch((error) => report(error, title))
}

// The invitation opens once the code has let the phrase out, and never before.
watch(
  step,
  (current) => {
    if (current !== 'pair' || host.value != null) return
    const mnemonic = task.phrase.value
    if (props.server == null || props.keyring == null || mnemonic == null) {
      toaster.create({ title: 'Cannot connect a device', description: 'This device has no sync server or no identity.', type: 'error' })
      emit('close')
      return
    }
    host.value = new PairingHost({ server: props.server, keyring: props.keyring, mnemonic })
    void host.value.start()
  },
  { immediate: true },
)

function close(): void {
  emit('close')
}

onBeforeUnmount(() => {
  void host.value?.cancel()
  task.dispose()
})
</script>

<template>
  <!-- A place of its own on the phone: the keypad and the phrase both want the screen. -->
  <ModalSurface open :title="title" full test-id="security-task" @close="close">
    <template v-if="step === 'confirm'">
      <p class="text">{{ CONFIRM_TEXT[kind] }}</p>
      <p v-if="task.error.value" class="error" role="alert">{{ task.error.value }}</p>
    </template>

    <CodeStep
      v-else-if="step === 'reentry'"
      :task="task"
      :text="REENTRY_TEXT[kind]"
      label="Unlock code"
      test-id="reentry-code"
      @submit="submit"
    />
    <CodeStep v-else-if="step === 'new-code'" :task="task" :text="NEW_CODE_TEXT" label="New code" test-id="new-unlock-code" @submit="submit" />
    <CodeStep
      v-else-if="step === 'repeat-code'"
      :task="task"
      text="So you don't mistype it"
      label="Repeat the code"
      test-id="repeat-unlock-code"
      @submit="submit"
    />

    <p v-else-if="step === 'applying'" class="text" role="status">
      The keys on this device are being encrypted again. The app restarts when it is done.
    </p>

    <RecoveryPhraseView v-else-if="step === 'phrase'" :words="task.words" @hide="task.hidePhrase()" />

    <PairDeviceFlow v-else-if="step === 'pair' && host" :host="host" :server="server ?? ''" />

    <template #footer>
      <template v-if="step === 'confirm'">
        <Button block variant="secondary" @click="close">Cancel</Button>
        <Button block variant="primary" :disabled="task.busy.value" data-testid="security-continue" @click="confirm">Continue</Button>
      </template>
      <Button v-else-if="step === 'reentry' || step === 'new-code'" block variant="ghost" :disabled="task.busy.value" @click="close">
        Cancel
      </Button>
      <Button v-else-if="step === 'repeat-code'" block variant="ghost" :disabled="task.busy.value" @click="task.differentCode()">
        Different code
      </Button>
      <Button v-else-if="step === 'phrase'" block variant="primary" data-testid="phrase-done" @click="close">Done</Button>
      <template v-else-if="step === 'pair' && host">
        <template v-if="pairShown === 'compare'">
          <Button
            block
            variant="secondary"
            :disabled="host.phase.value === 'sending'"
            data-testid="pairing-reject"
            @click="run(host.reject(), 'Could not open a new invitation')"
          >
            They don't match
          </Button>
          <Button
            block
            variant="primary"
            :disabled="host.phase.value === 'sending'"
            data-testid="pairing-confirm"
            @click="run(host.confirm(), 'Could not send the key')"
          >
            Match — send the key
          </Button>
        </template>
        <Button v-else-if="pairShown === 'done'" block variant="primary" @click="close">Done</Button>
        <template v-else-if="pairShown === 'expired' || pairShown === 'failed'">
          <Button block variant="secondary" @click="close">Close</Button>
          <Button block variant="primary" data-testid="pairing-restart" @click="run(host.start(), 'Could not open a new invitation')">
            New invitation
          </Button>
        </template>
        <Button v-else block variant="secondary" data-testid="pairing-cancel" @click="close">Cancel</Button>
      </template>
    </template>
  </ModalSurface>
</template>

<style scoped>
.text {
  margin: 0;
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.error {
  margin: 0;
  color: var(--danger-11);
}
</style>
