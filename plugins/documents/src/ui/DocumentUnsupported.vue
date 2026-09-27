<script setup lang="ts">
import { Button, Icon, Strip } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { canOpenExternally, openExternally } from '@arxhub/vfs'
import { computed } from 'vue'
import { DocumentsExtension } from '../documents-extension'
import { errorReason } from '../i18n/error-reason'
import { t } from '../i18n/messages'
import DocumentName from './DocumentName.vue'

const props = defineProps<{ path: string }>()

const arxhub = useArxHub()
const documents = arxhub.extensions.get(DocumentsExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const canOpen = computed(() => canOpenExternally(documents.vfs))

async function openInSystemApp(): Promise<void> {
  try {
    await openExternally(documents.vfs, props.path)
  } catch (error) {
    arxhub.logger.error(`[documents] failed to open ${props.path} in the system app:`, error)
    toaster.create({ type: 'error', title: t('unsupported.openFailed'), description: errorReason(error) })
  }
}
</script>

<template>
  <!-- The file was found, there is nothing to open it with. That is an answer, not a refusal: the tab
       exists, and it says what is missing. The name still leads the panel — a wrong extension is the
       usual reason nothing claims the file, and this is where it is read and fixed. -->
  <div class="document-unsupported-panel">
    <Strip>
      <DocumentName :path="path" />
    </Strip>
    <div class="document-unsupported" :class="{ touch }">
      <p class="headline">{{ t('unsupported.headline') }}</p>
      <p class="path">{{ path }}</p>
      <p class="hint">{{ t('unsupported.hint') }}</p>
      <!-- Hidden rather than disabled where the backend cannot honour it (a browser) — nothing dead is
           ever drawn (see packages/vfs/src/capabilities/open-externally.ts). -->
      <Button v-if="canOpen" :size="buttonSize" variant="secondary" @click="openInSystemApp">
        <Icon name="lu:external-link" :size="14" />
        {{ t('unsupported.openExternally') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.document-unsupported-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.document-unsupported {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  font-family: var(--font-sans);
  text-align: center;
}

.headline {
  margin: 0;
  color: var(--gray-12);
  font-size: var(--font-size-md);
}

.path {
  margin: 0;
  color: var(--gray-11);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.document-unsupported.touch .path {
  font-size: var(--font-size-sm);
}

.hint {
  margin: 0;
  color: var(--gray-10);
  font-size: var(--font-size-sm);
}

.document-unsupported.touch .hint {
  font-size: var(--font-size-md);
}
</style>
