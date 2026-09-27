<script setup lang="ts">
import { DOCUMENTS_TYPE_ID } from '@arxhub/plugin-documents'
import { SEARCH_TYPE_ID } from '@arxhub/plugin-search'
import { ShellExtension } from '@arxhub/plugin-shell'
import { useHotkeysExtension } from '@arxhub/plugin-shell/ui'
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Button, ScrollArea } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { t } from '../i18n/messages'

// The frame is already decided and published at boot, so the copy can name the control the reader is
// actually looking at instead of describing both and leaving them to work out which one they have.
const mobile = useShellFrame() === 'mobile'

const shell = useArxHub().extensions.get(ShellExtension)
const hotkeys = useHotkeysExtension()
const shortcuts = computed(() => [
  { chord: 'Mod-k', does: t('welcome.shortcuts.open') },
  { chord: 'Mod-s', does: t('welcome.shortcuts.save') },
  { chord: 'Mod-b', does: t('welcome.shortcuts.bold') },
  { chord: 'Mod-i', does: t('welcome.shortcuts.italic') },
  { chord: 'Mod-Shift-k', does: t('welcome.shortcuts.link') },
  { chord: 'F2', does: t('welcome.shortcuts.rename') },
])

async function createDocument(): Promise<void> {
  try {
    await shell.types.get(DOCUMENTS_TYPE_ID)?.create?.run()
  } catch (error) {
    toaster.create({ title: t('welcome.createFailed'), description: String(error), type: 'error' })
  }
}
</script>

<template>
  <ScrollArea class="welcome-panel" :class="{ touch: mobile }" content-class="welcome-inner">
    <div class="sheet">
      <!-- design-ignore: the product's name is not translated -->
      <h1>ArxHub</h1>

      <p class="lede">{{ t('welcome.lede') }}</p>

      <div class="welcome-actions">
        <Button :size="mobile ? 'lg' : 'md'" @click="createDocument">{{ t('welcome.newNote') }}</Button>
        <Button v-if="shell.types.has(SEARCH_TYPE_ID)" :size="mobile ? 'lg' : 'md'" variant="secondary" @click="shell.workspace.activateType(SEARCH_TYPE_ID)">{{ t('welcome.findNote') }}</Button>
      </div>
      <p class="next">{{ t('welcome.next') }}</p>

      <!-- Desktop only: a phone has no keyboard to press these on until something is focused, and the
           list would be five rows of noise on the smaller screen. -->
      <dl v-if="!mobile" class="shortcuts">
        <div v-for="shortcut in shortcuts" :key="shortcut.chord" class="shortcut">
          <dt>
            <kbd>{{ hotkeys.label(shortcut.chord) }}</kbd>
          </dt>
          <dd>{{ shortcut.does }}</dd>
        </div>
      </dl>
    </div>
  </ScrollArea>
</template>

<style scoped>
.welcome-panel {
  width: 100%;
  height: 100%;
}

.welcome-panel :deep(.welcome-inner) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.welcome-panel.touch :deep(.welcome-inner) {
  padding: 16px;
}

/* Left-aligned inside a centred block: the block is what sits in the middle of the panel, not each of
   its lines — centred prose starts every line in a different place. */
.sheet {
  width: 100%;
  max-width: 46ch;
}

h1 {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-tight);
  color: var(--gray-12);
}

.lede {
  margin: 8px 0 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--gray-11);
}

.welcome-panel.touch .lede,
.welcome-panel.touch .next {
  font-size: var(--font-size-md);
}

.next {
  margin: 16px 0 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--gray-12);
}

.welcome-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 24px 0 0;
  padding: 16px 0 0;
  border-top: 1px solid var(--gray-4);
}

.shortcut {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

/* Fixed width, so the descriptions form a column instead of stepping in and out with the key names.
   Wide enough for the longest chord in the list — three keys, since the link moved to Ctrl+Shift+K. */
dt {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  width: 120px;
}

dd {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--gray-11);
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-xs);
  background: var(--gray-2);
  color: var(--gray-11);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-none);
}
</style>
