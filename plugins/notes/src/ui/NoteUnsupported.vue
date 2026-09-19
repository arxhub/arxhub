<script setup lang="ts">
import { Button, Icon, Strip } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { canOpenExternally, openExternally } from '@arxhub/vfs'
import { computed } from 'vue'
import { NotesExtension } from '../notes-extension'
import DocumentName from './DocumentName.vue'

const props = defineProps<{ path: string }>()

const arxhub = useArxHub()
const notes = arxhub.extensions.get(NotesExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const canOpen = computed(() => canOpenExternally(notes.vfs))

async function openInSystemApp(): Promise<void> {
  try {
    await openExternally(notes.vfs, props.path)
  } catch (error) {
    arxhub.logger.error(`[notes] failed to open ${props.path} in the system app:`, error)
    const description = error instanceof Error ? error.message : String(error ?? '')
    toaster.create({ type: 'error', title: 'Could not open the file in the system app', description })
  }
}
</script>

<template>
  <!-- The file was found, there is nothing to open it with. That is an answer, not a refusal: the tab
       exists, and it says what is missing. The name still leads the panel — a wrong extension is the
       usual reason nothing claims the file, and this is where it is read and fixed. -->
  <div class="note-unsupported-panel">
    <Strip>
      <DocumentName :path="path" />
    </Strip>
    <div class="note-unsupported" :class="{ touch }">
      <p class="headline">Nothing can open this file</p>
      <p class="path">{{ path }}</p>
      <p class="hint">No installed viewer claims this extension.</p>
      <!-- Hidden rather than disabled where the backend cannot honour it (a browser) — nothing dead is
           ever drawn (see packages/vfs/src/capabilities/open-externally.ts). -->
      <Button v-if="canOpen" :size="buttonSize" variant="secondary" @click="openInSystemApp">
        <Icon name="lu:external-link" :size="14" />
        Open in system app
      </Button>
    </div>
  </div>
</template>

<style scoped>
.note-unsupported-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.note-unsupported {
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

.note-unsupported.touch .path {
  font-size: var(--font-size-sm);
}

.hint {
  margin: 0;
  color: var(--gray-10);
  font-size: var(--font-size-sm);
}

.note-unsupported.touch .hint {
  font-size: var(--font-size-md);
}
</style>
