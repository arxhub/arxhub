<script setup lang="ts">
import { KeyStoreExtension } from '@arxhub/plugin-keystore/ui'
import { Button, modals } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { ref } from 'vue'
import { IDENTITY_MNEMONIC_KEY } from '../identity'
import { KeyringExtension } from '../keyring-extension'

const arxhub = useArxHub()
const keystore = arxhub.extensions.get(KeyStoreExtension).keystore
const keyring = arxhub.extensions.get(KeyringExtension).keyring

const phrase = ref<string | null>(null)

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
          <code class="value">{{ keyring.authPublicKey }}</code>
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
        <code class="value phrase">{{ phrase }}</code>
        <div class="row">
          <Button size="sm" variant="secondary" @click="run(copy(phrase, 'Recovery phrase'), 'Could not copy')">Copy</Button>
          <Button size="sm" variant="ghost" @click="phrase = null">Hide</Button>
        </div>
      </template>
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
</style>
