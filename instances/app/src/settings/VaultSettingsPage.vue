<script setup lang="ts">
import { Button, PageLayout } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { isTauri } from '@tauri-apps/api/core'
import { homeDir, join } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { ref } from 'vue'
import { t } from '../i18n/messages'

const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'md'

const vaultPath = ref<string | null>(null)
const error = ref<string | null>(null)

async function openVault(): Promise<void> {
  error.value = null
  try {
    if (!isTauri()) {
      error.value = t('vault.desktopOnly')
      return
    }
    vaultPath.value = await join(await homeDir(), '.arxhub', 'vault')
    await openPath(vaultPath.value)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
</script>

<template>
  <PageLayout :title="t('vault.title')" :description="t('vault.description')">
    <div class="vault-settings">
      <p class="vault-path">{{ vaultPath ?? '~/.arxhub/vault' }}</p>
      <Button :size="buttonSize" variant="secondary" @click="openVault">{{ t('vault.open') }}</Button>
      <p v-if="error" class="vault-error">{{ error }}</p>
    </div>
  </PageLayout>
</template>

<style scoped>
.vault-settings {
  display: grid;
  gap: 12px;
  max-width: 560px;
}

.vault-path {
  margin: 0;
  color: var(--gray-11);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.vault-error {
  margin: 0;
  color: var(--danger-11);
  font-size: var(--font-size-sm);
}
</style>
