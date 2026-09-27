<script setup lang="ts">
import { keyringFromMnemonic, validateMnemonic } from '@arxhub/crypto'
import { illegalState } from '@arxhub/errors'
import {
  type CodeShape,
  changeUnlockCode,
  deviceCodeBackoff,
  disableDeviceLock,
  enableDeviceLock,
  getCodeShape,
  isDeviceLocked,
  KeyStoreExtension,
  LocalStorageKeyStore,
  verifyUnlockCode,
} from '@arxhub/plugin-keystore'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { Button, Card, modals, PageLayout, Row } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { VaultVfs } from '@arxhub/vfs'
import { computed, markRaw, onMounted, ref, shallowRef } from 'vue'
import { IDENTITY_MNEMONIC_KEY } from '../identity'
import { KeyringExtension } from '../keyring-extension'
import { decideIdentityChange } from '../owner-decision'
import { PairingExtension } from '../pairing-extension'
import type { SecurityTaskDeps, SecurityTaskKind } from '../security/security-task'
import { clearVaultWorkingTree, isVaultEmpty } from '../vault-reset'
import OwnerHandoverDialog from './OwnerHandoverDialog.vue'
import SecurityTaskView from './security/SecurityTaskView.vue'

const arxhub = useArxHub()
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const keystoreExt = arxhub.extensions.get(KeyStoreExtension)
const keystore = keystoreExt.keystore
const deviceLockRequired = keystoreExt.deviceLockRequired
const keyrings = arxhub.extensions.get(KeyringExtension)
const keyring = keyrings.keyring
const pairingServer = arxhub.extensions.get(PairingExtension).server
const settings = arxhub.extensions.has(SettingsExtension) ? arxhub.extensions.get(SettingsExtension) : null
// "Connect a server" leads to sync's own section, which exists only while sync is registered.
const canOpenSync = computed(() => settings?.sections.value.some((section) => section.id === 'sync') ?? false)

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

// Unknown until read: a task started before then must not guess "no lock" and skip the code.
const locked = ref<boolean | null>(null)
const codeShape = ref<CodeShape>('digits-6')

onMounted(async () => {
  locked.value = await isDeviceLocked(rawKeystore)
  codeShape.value = await getCodeShape(rawKeystore)
})

// The task on screen, if any. A new object per start, so every run asks for the code again.
const task = shallowRef<{ kind: SecurityTaskKind; deps: SecurityTaskDeps; id: number } | null>(null)
let taskId = 0

// The lock is read again at the tap rather than taken from the page's copy: whether the code is asked
// for must never rest on a value that may not have arrived yet.
async function startTask(kind: SecurityTaskKind): Promise<void> {
  const [isLocked, shape] = await Promise.all([isDeviceLocked(rawKeystore), getCodeShape(rawKeystore)])
  locked.value = isLocked
  codeShape.value = shape
  const deps: SecurityTaskDeps = {
    locked: isLocked,
    codeShape: shape,
    backoff: deviceCodeBackoff,
    verify: (code) => verifyUnlockCode(rawKeystore, code),
    readPhrase: () => keystore.get(IDENTITY_MNEMONIC_KEY),
    changeCode: async (current, next) => void (await changeUnlockCode(rawKeystore, current, next)),
    enableLock: async (code) => void (await enableDeviceLock(rawKeystore, code)),
    disableLock: async (current) => void (await disableDeviceLock(rawKeystore, current)),
  }
  task.value = { kind, deps, id: ++taskId }
}

const APPLIED: Partial<Record<SecurityTaskKind, string>> = {
  'change-code': 'Unlock code changed',
  lock: 'Device locked',
  'remove-lock': 'Device lock removed',
}

// Every lock change swaps the store the whole app reads secrets from, and that store is resolved
// before ArxHub.start() — so, as with replacing the identity, the way to apply it is a fresh boot.
function applied(kind: SecurityTaskKind): void {
  toaster.create({ title: APPLIED[kind] ?? 'Saved', type: 'success' })
  window.location.reload()
}

function openSyncSettings(): void {
  settings?.open('sync')
}

const entered = ref('')
const normalized = computed(() => entered.value.trim().replace(/\s+/g, ' ').toLowerCase())
const enteredValid = computed(() => normalized.value.length > 0 && validateMnemonic(normalized.value))

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
    <section class="rows" aria-label="Security actions">
      <Row
        as="button"
        plated
        next
        icon="lu:key-round"
        label="Show recovery phrase"
        detail="12 words — connect a device or restore the vault"
        :disabled="locked == null"
        data-testid="security-show-phrase"
        @click="startTask('phrase')"
      />
      <Row
        v-if="pairingServer"
        as="button"
        plated
        next
        icon="lu:qr-code"
        label="Connect a device"
        detail="A QR for a new phone or computer"
        :disabled="locked == null"
        data-testid="security-pair"
        @click="startTask('pair')"
      />
      <template v-else>
        <Row
          as="button"
          plated
          disabled
          icon="lu:qr-code"
          label="Connect a device"
          detail="Connect a sync server first — without one, devices have nothing to exchange through. You can still enter the phrase on the new device."
          data-testid="security-pair"
        />
        <div v-if="canOpenSync" class="row-action">
          <Button block variant="secondary" icon="lu:server" data-testid="security-connect-server" @click="openSyncSettings">Connect a server</Button>
        </div>
      </template>
      <Row
        v-if="locked"
        as="button"
        plated
        next
        icon="lu:lock"
        label="Change this device's code"
        detail="6 digits"
        :disabled="locked == null"
        data-testid="security-change-code"
        @click="startTask('change-code')"
      />
      <Row
        v-else
        as="button"
        plated
        next
        icon="lu:lock-open"
        label="Lock this device"
        detail="6 digits. The keys on this device are stored unencrypted until then."
        :disabled="locked == null"
        data-testid="security-lock"
        @click="startTask('lock')"
      />
      <Row
        v-if="locked && !deviceLockRequired"
        as="button"
        plated
        next
        tone="danger"
        icon="lu:lock-open"
        label="Remove the device lock"
        detail="The recovery phrase goes back to being stored unencrypted"
        :disabled="locked == null"
        data-testid="security-remove-lock"
        @click="startTask('remove-lock')"
      />
      <p class="footnote">Showing the phrase and connecting a device ask for the code every time: both hand out the vault key.</p>
    </section>

    <section class="section">
      <h3 class="section-title">Device identity</h3>
      <p v-if="!keyring" class="hint">This device has no identity. Sync and publishing stay idle until one exists.</p>
      <template v-else>
        <p class="hint">
          The public key is what a server pins to recognise this device. It is safe to share.
        </p>
        <div class="value-row">
          <code class="value" data-testid="public-key">{{ keyring.authPublicKey }}</code>
          <Button :size="buttonSize" variant="secondary" @click="run(copy(keyring.authPublicKey, 'Public key'), 'Could not copy')">Copy</Button>
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
      <div class="value-row">
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
    <SecurityTaskView
      v-if="task"
      :key="task.id"
      :kind="task.kind"
      :deps="task.deps"
      :server="pairingServer"
      :keyring="keyring"
      @close="task = null"
      @applied="applied(task.kind)"
    />
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

/* The rows carry their own hairlines, so they stack without a gap. */
.rows {
  display: flex;
  flex-direction: column;
}

.row-action {
  padding: 8px 0;
}

.footnote {
  margin: 12px 0 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

/* Not `.block` or `.row`: a scoped rule also lands on a child component's root, and Button and Row carry
   those very classes — `.block` stacked the "Connect a server" button's label against its left edge. */
.section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.section-title {
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

.value-row {
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
