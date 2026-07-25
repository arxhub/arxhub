<script setup lang="ts">
import { validateMnemonic } from '@arxhub/crypto'
import { KeyStoreExtension } from '@arxhub/plugin-keystore/ui'
import { Button, modals } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { IDENTITY_MNEMONIC_KEY } from '../identity'
import { KeyringExtension } from '../keyring-extension'

const arxhub = useArxHub()
const keystore = arxhub.extensions.get(KeyStoreExtension).keystore
const keyring = arxhub.extensions.get(KeyringExtension).keyring

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

    <section class="block">
      <h3 class="block-title">Use an existing recovery phrase</h3>
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
      />
      <p v-if="normalized && !enteredValid" class="invalid">Not a valid recovery phrase — check the words and their order.</p>
      <div class="row">
        <Button size="sm" variant="danger" :disabled="!enteredValid" @click="confirmReplace">Replace identity</Button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.security {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
  font-family: var(--font-sans);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.block-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.hint {
  margin: 0;
  max-width: 60ch;
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.value {
  padding: var(--space-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-12);
  overflow-wrap: anywhere;
}

.phrase {
  line-height: 1.8;
  letter-spacing: 0.02em;
}

.entry {
  max-width: 60ch;
  padding: 0.5rem;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-12);
  resize: vertical;
}

.entry:focus {
  border-color: var(--accent-9);
  box-shadow: 0 0 0 1px var(--accent-a2);
  outline: none;
}

.invalid {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--danger-11);
}
</style>
