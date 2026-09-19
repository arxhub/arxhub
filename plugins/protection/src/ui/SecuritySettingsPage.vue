<script setup lang="ts">
import { keyringFromMnemonic, validateMnemonic } from '@arxhub/crypto'
import { hasErrorCode, illegalState } from '@arxhub/errors'
import {
  changeUnlockCode,
  disableDeviceLock,
  enableDeviceLock,
  isDeviceLocked,
  isUnlockCodeValid,
  KeyStoreExtension,
  LocalStorageKeyStore,
  MIN_UNLOCK_CODE_LENGTH,
} from '@arxhub/plugin-keystore'
import { PinEntry } from '@arxhub/plugin-keystore/ui'
import { Badge, Button, Card, modals, PageLayout } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { VaultVfs } from '@arxhub/vfs'
import { computed, markRaw, onMounted, ref } from 'vue'
import { IDENTITY_MNEMONIC_KEY } from '../identity'
import { KeyringExtension } from '../keyring-extension'
import { decideIdentityChange } from '../owner-decision'
import { clearVaultWorkingTree, isVaultEmpty } from '../vault-reset'
import OwnerHandoverDialog from './OwnerHandoverDialog.vue'

const arxhub = useArxHub()
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const keystoreExt = arxhub.extensions.get(KeyStoreExtension)
const keystore = keystoreExt.keystore
const deviceLockRequired = keystoreExt.deviceLockRequired
const keyrings = arxhub.extensions.get(KeyringExtension)
const keyring = keyrings.keyring

// This page is the one surface that may delete the working tree, so it reads the vault view itself
// rather than borrowing one from a plugin that happens to hold it. An instance without a vault (there
// is nothing to lose there) leaves it null.
const vault = (() => {
  try {
    return arxhub.services.get(VaultVfs)
  } catch {
    return null
  }
})()

// The lock operations rewrite the raw entries, so they need the undecorated localStorage view rather
// than whatever decorated store the app booted on. A LocalStorageKeyStore holds no state of its own,
// so a fresh one is the same store.
const rawKeystore = new LocalStorageKeyStore()

const locked = ref(false)
const currentCode = ref('')
const newCode = ref('')
const lockBusy = ref(false)

const newCodeValid = computed(() => isUnlockCodeValid(newCode.value))

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
  if (!newCodeValid.value || currentCode.value.length === 0) return
  void applyLockChange(() => changeUnlockCode(rawKeystore, currentCode.value, newCode.value), 'Unlock code changed')
}

function submitEnableLock(): void {
  if (newCodeValid.value) confirmEnableLock()
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

// A BIP39 checksum only answers “is this a phrase at all”. Deriving its auth key answers “is this
// YOUR phrase” — pure, offline and instant, so it costs a keystroke and no round trip.
const enteredKey = computed(() => (enteredValid.value ? keyringFromMnemonic(normalized.value).authPublicKey : null))

const previousOwner = ref<string | null>(null)
// Conservative until proven otherwise: an unknown vault is a vault worth asking about.
const vaultEmpty = ref(false)
const replaceBusy = ref(false)

onMounted(async () => {
  // The marker as it was BEFORE this boot — the memoised accessor hands every caller the same value,
  // so it does not matter that the page asks long after sync already did.
  previousOwner.value = (await keyrings.owner())?.previousOwner ?? null
  vaultEmpty.value = await readVaultEmpty()
})

async function readVaultEmpty(): Promise<boolean> {
  if (vault == null) return false
  try {
    return await isVaultEmpty(vault)
  } catch {
    // Not knowing what is at stake is a reason to ask the question, never a reason to skip it.
    return false
  }
}

const decision = computed(() => {
  if (keyring == null || enteredKey.value == null) return null
  return decideIdentityChange({
    entered: enteredKey.value,
    current: keyring.authPublicKey,
    previousOwner: previousOwner.value,
    vaultEmpty: vaultEmpty.value,
  })
})

// Said before anything is pressed: the common cases (your own phrase, the phrase for the files that
// are here) should never look like they are about to take something away.
const verdict = computed(() => {
  switch (decision.value?.kind) {
    case 'nothing-to-lose':
      return 'This device holds no files, so there is nothing to lose by switching to this phrase.'
    case 'already-this-device':
      return 'This is already this device’s phrase — there is nothing to change.'
    case 'restores-owner':
      return 'This is the phrase the files on this device belong to. Restoring it changes nothing about them.'
    case 'foreign-owner':
      return 'This phrase belongs to a different owner and this device holds files — you will be asked what happens to them.'
    default:
      return null
  }
})

const canApply = computed(() => decision.value != null && decision.value.kind !== 'already-this-device')
const restoring = computed(() => decision.value?.kind === 'restores-owner')

async function beginReplace(): Promise<void> {
  if (keyring == null || enteredKey.value == null) return
  // Captured together: the phrase and the key derived from it must not drift apart while a dialog is
  // open between the decision and the write.
  const mnemonic = normalized.value
  const entered = enteredKey.value
  // Re-read rather than trust what mount saw: this answer decides whether anything is asked at all.
  vaultEmpty.value = await readVaultEmpty()

  const outcome = decideIdentityChange({
    entered,
    current: keyring.authPublicKey,
    previousOwner: previousOwner.value,
    vaultEmpty: vaultEmpty.value,
  })

  switch (outcome.kind) {
    // The button is already disabled for this, and the line under the field says so; this is the belt
    // for anyone reaching the decision by another route.
    case 'already-this-device':
      toaster.create({ title: 'That is already this device’s phrase', description: 'Nothing was changed.', type: 'info' })
      return
    // Nothing is being taken from anyone in either of these: an empty vault has nothing to lose, and
    // the phrase that owns the files on disk is the one they were waiting for.
    case 'nothing-to-lose':
    case 'restores-owner':
      await applyIdentity(mnemonic, entered, false)
      return
    case 'foreign-owner':
      openHandover(mnemonic, entered)
  }
}

const HANDOVER_MODAL_ID = 'arxhub.protection.handover'

function openHandover(mnemonic: string, entered: string): void {
  modals.open({
    modalId: HANDOVER_MODAL_ID,
    title: 'This phrase belongs to another owner',
    size: 'md',
    centered: true,
    content: markRaw(OwnerHandoverDialog),
    contentProps: {
      modalId: HANDOVER_MODAL_ID,
      onKeepLocalFiles: () => run(applyIdentity(mnemonic, entered, false), 'Could not replace the identity'),
      onTakeFromServer: () => run(applyIdentity(mnemonic, entered, true), 'Could not replace the identity'),
    },
  })
}

// The identity is resolved from the key store before ArxHub.start(), so a replacement can only take
// effect on a fresh boot — hence the reload rather than swapping the keyring in place.
//
// Order is the safety property here: the working tree goes first, so a wipe that fails leaves the
// device exactly as it was instead of half handed over. Only after it succeeds does the phrase become
// this device’s, and the marker record the handover — which is what the next boot reads to drop the
// previous owner’s derived state.
async function applyIdentity(mnemonic: string, publicKey: string, wipeVault: boolean): Promise<void> {
  replaceBusy.value = true
  try {
    if (wipeVault) {
      if (vault == null) throw illegalState('This device has no vault to clear')
      await clearVaultWorkingTree(vault)
    }
    await keystore.set(IDENTITY_MNEMONIC_KEY, mnemonic)
    // Past this point the phrase IS this device's, so a marker that could not be written must not be
    // reported as “could not replace the identity”. The cost of losing it is that the next boot does
    // not know the handover was deliberate — which errs towards discarding the previous owner's
    // derived state, never towards keeping it.
    await keyrings.claimOwner(publicKey).catch((error) => arxhub.logger.warn('[protection] could not record the identity handover', error))
    window.location.reload()
  } catch (error) {
    replaceBusy.value = false
    throw error
  }
}
</script>

<template>
  <PageLayout title="Security" description="Keys live on this device only. Nothing here is sent anywhere unless you set up sync.">
    <div class="security" :class="{ touch }">
    <section class="block">
      <h3 class="block-title">Device identity</h3>
      <p v-if="!keyring" class="hint">This device has no identity. Sync and publishing stay idle until one exists.</p>
      <template v-else>
        <p class="hint">
          The public key is what a server pins to recognise this device. It is safe to share.
        </p>
        <div class="row">
          <code class="value" data-testid="public-key">{{ keyring.authPublicKey }}</code>
          <Button :size="buttonSize" variant="secondary" @click="run(copy(keyring.authPublicKey, 'Public key'), 'Could not copy')">Copy</Button>
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
        <p class="hint">
          The code is {{ MIN_UNLOCK_CODE_LENGTH }} digits or more. It stops whoever ends up with a copy of this
          profile, not someone who came for your vault and can spend an afternoon on it.
        </p>
        <PinEntry
          v-model="newCode"
          label="New unlock code"
          :placeholder="`Unlock code, ${MIN_UNLOCK_CODE_LENGTH}+ digits`"
          autocomplete="new-password"
          test-id="new-unlock-code"
          @submit="submitEnableLock"
        />
        <div class="row">
          <Button :size="buttonSize" variant="secondary" :disabled="!newCodeValid || lockBusy" @click="confirmEnableLock">
            Lock this device
          </Button>
        </div>
      </template>

      <template v-else>
        <PinEntry
          v-model="currentCode"
          label="Current unlock code"
          placeholder="Current unlock code"
          autocomplete="current-password"
          test-id="current-unlock-code"
        />
        <PinEntry
          v-model="newCode"
          label="New unlock code"
          :placeholder="`New code, ${MIN_UNLOCK_CODE_LENGTH}+ digits`"
          autocomplete="new-password"
          test-id="new-unlock-code"
          @submit="submitChangeCode"
        />
        <div class="row">
          <Button :size="buttonSize" variant="secondary" :disabled="!newCodeValid || currentCode.length === 0 || lockBusy" @click="submitChangeCode">
            Change code
          </Button>
          <Button
            v-if="!deviceLockRequired"
            :size="buttonSize"
            variant="danger"
            :disabled="currentCode.length === 0 || lockBusy"
            @click="confirmDisableLock"
          >
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
        <Button :size="buttonSize" variant="secondary" @click="confirmReveal">Show recovery phrase</Button>
      </div>
      <template v-else>
        <code class="value phrase" data-testid="recovery-phrase">{{ phrase }}</code>
        <div class="row">
          <Button :size="buttonSize" variant="secondary" @click="run(copy(phrase, 'Recovery phrase'), 'Could not copy')">Copy</Button>
          <Button :size="buttonSize" variant="ghost" @click="phrase = null">Hide</Button>
        </div>
      </template>
    </section>

    <Card variant="danger" label="Irreversible" title="Use an existing recovery phrase">
      <p class="hint">
        Enter the phrase from another device to make this one the same owner. Save the current phrase first — replacing
        it cannot be undone from here. The phrase is compared with what this device already knows, so you are only
        asked about your files when it really is a different owner.
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
      <p v-else-if="verdict" class="hint" data-testid="phrase-verdict">{{ verdict }}</p>
      <div class="row">
        <Button
          :size="buttonSize"
          :variant="restoring ? 'primary' : 'danger'"
          :disabled="!canApply || replaceBusy"
          data-testid="replace-identity"
          @click="run(beginReplace(), 'Could not replace the identity')"
        >
          {{ restoring ? 'Restore identity' : 'Replace identity' }}
        </Button>
      </div>
    </Card>
    </div>
  </PageLayout>
</template>

<style scoped>
/* One measure for the whole page, set once here rather than repeated per element. Every block already
   asked for 60ch except the danger card, which had none — so the most consequential control on the page
   was also the only one running the full width of the window, which reads as a layout fault rather than
   as emphasis. */
.security {
  display: flex;
  flex-direction: column;
  gap: 32px;
  max-width: 60ch;
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
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--gray-11);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.value {
  width: 100%;
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

.security.touch .value {
  font-size: var(--font-size-sm);
  min-height: var(--size-xl);
}

.phrase {
  line-height: 1.8;
  letter-spacing: 0.02em;
}

.entry {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  resize: vertical;
}

.security.touch .entry {
  font-size: var(--font-size-md);
  min-height: var(--size-2xl);
  padding: 12px 16px;
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

.security.touch .invalid {
  font-size: var(--font-size-sm);
}
</style>
