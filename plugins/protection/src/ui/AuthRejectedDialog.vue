<script setup lang="ts">
import { SETTINGS_TYPE_ID, SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { Button } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { authStatus, describeRejection } from '../auth-status'
import { KeyringExtension } from '../keyring-extension'
import { closeAuthRejectedDialog } from './auth-dialog'

const arxhub = useArxHub()
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'
const touch = useShellFrame() === 'mobile'
const shell = arxhub.extensions.get(ShellExtension)
const settings = arxhub.extensions.get(SettingsExtension)
const keyring = arxhub.extensions.get(KeyringExtension).keyring

const rejection = computed(() => authStatus.rejection.value)
const copy = computed(() => describeRejection(rejection.value?.reason ?? null))

function openSecurity(): void {
  closeAuthRejectedDialog()
  settings.open('security')
  shell.workspace.activateType(SETTINGS_TYPE_ID)
}
</script>

<template>
  <div class="auth-rejected" :class="{ touch }">
    <p class="auth-detail">{{ copy.detail }}</p>
    <p v-if="copy.fix" class="auth-fix">{{ copy.fix }}</p>

    <dl class="auth-meta">
      <div v-if="rejection != null">
        <dt>Refused</dt>
        <dd>{{ rejection.method }} {{ rejection.path }}</dd>
      </div>
      <div v-if="rejection != null">
        <dt>Reason</dt>
        <dd>{{ rejection.reason ?? 'not reported' }}</dd>
      </div>
      <!-- The key this device presents, so it can be compared with the one the server pinned without
           digging it out of a console. It is a public key; there is nothing here to leak. -->
      <div v-if="keyring != null">
        <dt>This device</dt>
        <dd>{{ keyring.authPublicKey }}</dd>
      </div>
    </dl>

    <div class="auth-actions">
      <Button :size="buttonSize" variant="secondary" @click="closeAuthRejectedDialog()">Close</Button>
      <Button v-if="copy.offerPhrase" :size="buttonSize" variant="primary" @click="openSecurity">Recovery phrase…</Button>
    </div>
  </div>
</template>

<style scoped>
.auth-detail,
.auth-fix {
  margin: 0 0 12px;
  max-width: 62ch;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--gray-11);
}

.auth-detail {
  color: var(--gray-12);
}

.auth-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--gray-4);
}

.auth-meta div {
  display: flex;
  gap: 8px;
}

.auth-meta dt {
  flex: 0 0 88px;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-10);
}

.auth-meta dd {
  margin: 0;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  overflow-wrap: anywhere;
}

.auth-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.auth-rejected.touch .auth-actions {
  flex-direction: column-reverse;
  gap: 12px;
}

.auth-rejected.touch .auth-actions :deep(.btn) {
  width: 100%;
}
</style>
