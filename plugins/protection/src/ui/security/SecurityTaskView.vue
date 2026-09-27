<script setup lang="ts">
import type { Keyring } from '@arxhub/crypto'
import { Button, ModalSurface } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { errorText } from '../../error-text'
import { t } from '../../i18n/messages'
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

const reentryText = computed(() => {
  switch (props.kind) {
    case 'phrase':
      return t('task.reentry.phrase')
    case 'pair':
      return t('task.reentry.pair')
    case 'change-code':
      return t('task.reentry.changeCode')
    case 'remove-lock':
      return t('task.reentry.removeLock')
    default:
      return ''
  }
})

const confirmText = computed(() =>
  props.kind === 'phrase' ? t('task.confirm.phrase') : props.kind === 'pair' ? t('task.confirm.pair') : undefined,
)

const pairShown = computed(() => (host.value == null ? 'preparing' : pairScreen(host.value.phase.value)))

const title = computed(() => {
  switch (step.value) {
    case 'confirm':
      return props.kind === 'pair' ? t('security.pair') : t('security.showPhrase')
    case 'reentry':
      return t('task.enterCode')
    case 'phrase':
      return t('common.recoveryPhrase')
    case 'new-code':
      return props.kind === 'lock' ? t('task.createCode') : t('task.newCode')
    case 'repeat-code':
      return t('task.repeatCode')
    case 'applying':
      return props.kind === 'remove-lock' ? t('task.removingLock') : t('task.savingCode')
    case 'pair':
      switch (pairShown.value) {
        case 'compare':
          return t('common.compareDigits')
        case 'done':
          return t('task.deviceConnected')
        case 'expired':
          return t('task.invitationExpired')
        case 'failed':
          return t('common.notConnected')
        default:
          return t('security.pair')
      }
  }
  return t('security.title')
})

function report(error: unknown, title: string): void {
  toaster.create({ title, description: errorText(error), type: 'error' })
}

async function submit(): Promise<void> {
  try {
    if ((await task.submit()) === 'applied') emit('applied')
  } catch (error) {
    report(error, props.kind === 'remove-lock' ? t('task.removeFailed') : t('task.changeFailed'))
  }
}

async function confirm(): Promise<void> {
  try {
    if ((await task.confirm()) === 'applied') emit('applied')
  } catch (error) {
    report(error, t('task.continueFailed'))
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
      toaster.create({ title: t('task.cannotPair'), description: t('task.cannotPairDetail'), type: 'error' })
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
      <p class="text">{{ confirmText }}</p>
      <p v-if="task.error.value" class="error" role="alert">{{ task.error.value }}</p>
    </template>

    <CodeStep
      v-else-if="step === 'reentry'"
      :task="task"
      :text="reentryText"
      :label="t('task.unlockCode')"
      test-id="reentry-code"
      @submit="submit"
    />
    <CodeStep v-else-if="step === 'new-code'" :task="task" :text="t('task.newCodeText')" :label="t('task.newCode')" test-id="new-unlock-code" @submit="submit" />
    <CodeStep
      v-else-if="step === 'repeat-code'"
      :task="task"
:text="t('task.repeatText')"
      :label="t('task.repeatCode')"
      test-id="repeat-unlock-code"
      @submit="submit"
    />

    <p v-else-if="step === 'applying'" class="text" role="status">
      {{ t('task.applying') }}
    </p>

    <RecoveryPhraseView v-else-if="step === 'phrase'" :words="task.words" @hide="task.hidePhrase()" />

    <PairDeviceFlow v-else-if="step === 'pair' && host" :host="host" :server="server ?? ''" />

    <template #footer>
      <template v-if="step === 'confirm'">
        <Button block variant="secondary" @click="close">{{ t('common.cancel') }}</Button>
        <Button block variant="primary" :disabled="task.busy.value" data-testid="security-continue" @click="confirm">{{ t('task.continue') }}</Button>
      </template>
      <Button v-else-if="step === 'reentry' || step === 'new-code'" block variant="ghost" :disabled="task.busy.value" @click="close">
        {{ t('common.cancel') }}
      </Button>
      <Button v-else-if="step === 'repeat-code'" block variant="ghost" :disabled="task.busy.value" @click="task.differentCode()">
        {{ t('task.differentCode') }}
      </Button>
      <Button v-else-if="step === 'phrase'" block variant="primary" data-testid="phrase-done" @click="close">{{ t('common.done') }}</Button>
      <template v-else-if="step === 'pair' && host">
        <template v-if="pairShown === 'compare'">
          <Button
            block
            variant="secondary"
            :disabled="host.phase.value === 'sending'"
            data-testid="pairing-reject"
            @click="run(host.reject(), t('task.invitationFailed'))"
          >
            {{ t('common.theyDontMatch') }}
          </Button>
          <Button
            block
            variant="primary"
            :disabled="host.phase.value === 'sending'"
            data-testid="pairing-confirm"
            @click="run(host.confirm(), t('task.sendFailed'))"
          >
            {{ t('task.matchSend') }}
          </Button>
        </template>
        <Button v-else-if="pairShown === 'done'" block variant="primary" @click="close">{{ t('common.done') }}</Button>
        <template v-else-if="pairShown === 'expired' || pairShown === 'failed'">
          <Button block variant="secondary" @click="close">{{ t('common.close') }}</Button>
          <Button block variant="primary" data-testid="pairing-restart" @click="run(host.start(), t('task.invitationFailed'))">
            {{ t('task.newInvitation') }}
          </Button>
        </template>
        <Button v-else block variant="secondary" data-testid="pairing-cancel" @click="close">{{ t('common.cancel') }}</Button>
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
