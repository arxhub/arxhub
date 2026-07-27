<script setup lang="ts">
import { validateMnemonic } from '@arxhub/crypto'
import { hasErrorCode } from '@arxhub/errors'
import {
  changeUnlockCode,
  disableDeviceLock,
  enableDeviceLock,
  isDeviceLocked,
  KeyStoreExtension,
  LocalStorageKeyStore,
  MIN_UNLOCK_CODE_LENGTH,
} from '@arxhub/plugin-keystore/ui'
import { Badge, Button, Card, modals, PageLayout } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { computed, onMounted, ref } from 'vue'
import { IDENTITY_MNEMONIC_KEY } from '../identity'
import { KeyringExtension } from '../keyring-extension'

const arxhub = useArxHub()
const keystore = arxhub.extensions.get(KeyStoreExtension).keystore
const keyring = arxhub.extensions.get(KeyringExtension).keyring

// The lock operations rewrite the raw entries, so they need the undecorated localStorage view rather
// than whatever decorated store the app booted on. A LocalStorageKeyStore holds no state of its own,
// so a fresh one is the same store.
const rawKeystore = new LocalStorageKeyStore()

const locked = ref(false)
const currentCode = ref('')
const newCode = ref('')
const lockBusy = ref(false)

const newCodeLongEnough = computed(() => newCode.value.length >= MIN_UNLOCK_CODE_LENGTH)
// Digits alone are brute-forceable offline in hours; say so rather than showing a green tick.
const newCodeIsWeak = computed(() => newCodeLongEnough.value && /^\d+$/.test(newCode.value))

onMounted(async () => {
  locked.value = await isDeviceLocked(rawKeystore)
})

// Every lock change swaps the store the whole app reads secrets from, and that store is resolved
// before ArxHub.start() — so, as with replacing the identity, the way to apply it is a fresh boot.
async function applyLockChange(change: () => Promise<unknown>, success: string): Promise<void> {
  lockBusy.value = true
  try {
    await change()
    toaster.create({ title: success, type: 'success' })
    window.location.reload()
  } catch (error) {
    lockBusy.value = false
    const wrong = hasErrorCode(error, 'UnlockFailedError')
    toaster.create({
      title: wrong ? 'That code did not work' : 'Could not change the device lock',
      description: wrong ? undefined : String(error),
      type: 'error',
    })
  }
}

function confirmEnableLock(): void {
  modals.openConfirmModal({
    title: 'Lock this device',
    content:
      'Your keys will be encrypted with this code, and it will be asked for every time the app starts. There is no ' +
      'way to recover it: forgetting it means erasing this device and restoring from your recovery phrase.',
    labels: { confirm: 'Lock device', cancel: 'Cancel' },
    onConfirm: () => void applyLockChange(() => enableDeviceLock(rawKeystore, newCode.value), 'Device locked'),
  })
}

function confirmDisableLock(): void {
  modals.openConfirmModal({
    title: 'Remove the device lock',
    content: 'Your recovery phrase goes back to being stored unencrypted. Anyone who can read this browser profile can take it.',
    labels: { confirm: 'Remove lock', cancel: 'Cancel' },
    confirmProps: { danger: true },
    onConfirm: () => void applyLockChange(() => disableDeviceLock(rawKeystore, currentCode.value), 'Device lock removed'),
  })
}

function submitChangeCode(): void {
  void applyLockChange(() => changeUnlockCode(rawKeystore, currentCode.value, newCode.value), 'Unlock code changed')
}

const phrase = ref<string | null>(null)

const entered = ref('')
const normalized = computed(() => entered.value.trim().replace(/\s+/g, ' ').toLowerCase())
const enteredValid = computed(() => normalized.value.length > 0 && validateMnemonic(normalized.value))

async function reveal(): Promise<void> {
  const stored = (await keystore.get(IDENTITY_MNEMONIC_KEY))?.trim()
  if (!stored) {
    toaster.create({ title: 'No recovery phrase', description: 'This device has no stored identity.', type: 'error' })
    return
  }
  phrase.value = stored
}

function confirmReveal(): void {
  modals.openConfirmModal({
    title: 'Show recovery phrase',
    content: 'Anyone who reads these words gains full access to your vault. Make sure nobody can see your screen.',
    labels: { confirm: 'Show', cancel: 'Cancel' },
    onConfirm: () => {
      reveal().catch((error) => toaster.create({ title: 'Could not read the recovery phrase', description: String(error), type: 'error' }))
    },
  })
}

async function copy(text: string, what: string): Promise<void> {
  await navigator.clipboard.writeText(text)
  toaster.create({ title: `${what} copied`, type: 'success' })
}

function run(action: Promise<void>, title: string): void {
  action.catch((error) => toaster.create({ title, description: String(error), type: 'error' }))
}

// The identity is resolved from the key store before ArxHub.start(), so a replacement can only take
// effect on a fresh boot — hence the reload rather than swapping the keyring in place.
async function replaceIdentity(): Promise<void> {
  await keystore.set(IDENTITY_MNEMONIC_KEY, normalized.value)
  window.location.reload()
}

function confirmReplace(): void {
  modals.openConfirmModal({
    title: 'Replace this device’s identity',
    content:
      'This device will stop being the owner it is now. Anything encrypted under the current phrase becomes ' +
      'unreachable unless you saved that phrase. The app restarts to apply the new one.',
    labels: { confirm: 'Replace identity', cancel: 'Cancel' },
    confirmProps: { danger: true },
    onConfirm: () => run(replaceIdentity(), 'Could not replace the identity'),
  })
}
</script>

<template>
  <PageLayout title="Security" description="Keys live on this device only. Nothing here is sent anywhere unless you set up sync.">
    <div class="security">
    <section class="block">
      <h3 class="block-title">Device identity</h3>
      <p v-if="!keyring" class="hint">This device has no identity. Sync and publishing stay idle until one exists.</p>
      <template v-else>
        <p class="hint">
          The public key is what a server pins to recognise this device. It is safe to share.
        </p>
        <div class="row">
          <code class="value" data-testid="public-key">{{ keyring.authPublicKey }}</code>
          <Button size="sm" variant="secondary" @click="run(copy(keyring.authPublicKey, 'Public key'), 'Could not copy')">Copy</Button>
        </div>
      </template>
    </section>

    <section class="block">
      <div class="block-heading">
        <h3 class="block-title">Device lock</h3>
        <Badge :variant="locked ? 'success' : 'warning'" dot>{{ locked ? 'Locked' : 'Unlocked' }}</Badge>
      </div>
      <p v-if="locked" class="hint">
        This device's keys are encrypted. The code is asked for each time the app starts and is never stored.
      </p>
      <p v-else class="hint">
        <strong>This device's keys are stored unencrypted.</strong> Anyone who can read this browser profile — a
        backup, a synced account, another program on this machine — can take your recovery phrase. A lock encrypts
        them with a code only you know.
      </p>

      <template v-if="!locked">
        <input
          v-model="newCode"
          class="entry code"
          type="password"
          autocomplete="new-password"
          :placeholder="`Unlock code (at least ${MIN_UNLOCK_CODE_LENGTH} characters)`"
          data-testid="new-unlock-code"
        />
        <p v-if="newCodeIsWeak" class="hint">
          Digits only: someone who copies this profile can try every combination offline in a few hours. A phrase of a
          few words is far stronger and no harder to remember.
        </p>
        <div class="row">
          <Button size="sm" variant="secondary" :disabled="!newCodeLongEnough || lockBusy" @click="confirmEnableLock">
            Lock this device
          </Button>
        </div>
      </template>

      <template v-else>
        <input
          v-model="currentCode"
          class="entry code"
          type="password"
          autocomplete="current-password"
          placeholder="Current unlock code"
          data-testid="current-unlock-code"
        />
        <input
          v-model="newCode"
          class="entry code"
          type="password"
          autocomplete="new-password"
          placeholder="New unlock code (leave empty to only remove the lock)"
          data-testid="new-unlock-code"
        />
        <div class="row">
          <Button
            size="sm"
            variant="secondary"
            :disabled="!newCodeLongEnough || currentCode.length === 0 || lockBusy"
            @click="submitChangeCode"
          >
            Change code
          </Button>
          <Button size="sm" variant="danger" :disabled="currentCode.length === 0 || lockBusy" @click="confirmDisableLock">
            Remove lock
          </Button>
        </div>
      </template>
    </section>

    <section class="block">
      <h3 class="block-title">Recovery phrase</h3>
      <p class="hint">
        These twelve words are the only way to reach this vault from another device, and the only way back after losing
        this one. Store them outside this device.
      </p>
      <div v-if="phrase == null" class="row">
        <Button size="sm" variant="secondary" @click="confirmReveal">Show recovery phrase</Button>
      </div>
      <template v-else>
        <code class="value phrase" data-testid="recovery-phrase">{{ phrase }}</code>
        <div class="row">
          <Button size="sm" variant="secondary" @click="run(copy(phrase, 'Recovery phrase'), 'Could not copy')">Copy</Button>
          <Button size="sm" variant="ghost" @click="phrase = null">Hide</Button>
        </div>
      </template>
    </section>

    <Card variant="danger" label="Irreversible" title="Use an existing recovery phrase">
      <p class="hint">
        Enter the phrase from another device to make this one the same owner. Save the current phrase first — replacing
        it cannot be undone from here.
      </p>
      <textarea
        v-model="entered"
        class="entry"
        rows="3"
        spellcheck="false"
        autocomplete="off"
        placeholder="twelve words separated by spaces"
        data-testid="recovery-phrase-entry"
      />
      <p v-if="normalized && !enteredValid" class="invalid">Not a valid recovery phrase — check the words and their order.</p>
      <div class="row">
        <Button size="sm" variant="danger" :disabled="!enteredValid" @click="confirmReplace">Replace identity</Button>
      </div>
    </Card>
    </div>
  </PageLayout>
</template>

<style scoped>
.security {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.block-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.block-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.hint {
  margin: 0;
  max-width: 60ch;
  font-size: 13px;
  line-height: var(--line-height-relaxed);
  color: var(--gray-11);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Same measure as .hint, so the key card and the prose it explains share one left-and-right edge. */
.value {
  width: 100%;
  max-width: 60ch;
  padding: 12px 16px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-relaxed);
  color: var(--gray-12);
  overflow-wrap: anywhere;
}

.phrase {
  line-height: 1.8;
  letter-spacing: 0.02em;
}

.entry {
  width: 100%;
  max-width: 60ch;
  padding: 8px 12px;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  resize: vertical;
}

.code {
  height: 32px;
  max-width: 24rem;
  resize: none;
}

.entry:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
  border-color: var(--accent-8);
}

.invalid {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--danger-11);
}
</style>
