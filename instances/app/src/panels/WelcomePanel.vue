<script setup lang="ts">
import { NOTES_TYPE_ID } from '@arxhub/plugin-notes'
import { SEARCH_TYPE_ID } from '@arxhub/plugin-search'
import { ShellExtension } from '@arxhub/plugin-shell'
import { useHotkeysExtension } from '@arxhub/plugin-shell/ui'
import { Button } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'

// The frame is already decided and published at boot, so the copy can name the control the reader is
// actually looking at instead of describing both and leaving them to work out which one they have.
const mobile = useShellFrame() === 'mobile'

const shell = useArxHub().extensions.get(ShellExtension)
const hotkeys = useHotkeysExtension()
const SHORTCUTS = [
  { chord: 'Mod-k', does: 'Open or switch to' },
  { chord: 'Mod-s', does: 'Save the open file' },
  { chord: 'Mod-b', does: 'Bold in a note' },
  { chord: 'Mod-i', does: 'Italic' },
  { chord: 'Mod-Shift-k', does: 'Insert a link in markdown' },
  { chord: 'F2', does: 'Rename in the file tree' },
]

async function createNote(): Promise<void> {
  try {
    await shell.types.get(NOTES_TYPE_ID)?.create?.run()
  } catch (error) {
    toaster.create({ title: 'Could not create the note', description: String(error), type: 'error' })
  }
}
</script>

<template>
  <div class="welcome-panel">
    <div class="sheet">
      <h1>ArxHub</h1>
      <p class="lede">
        Your notes, stored as files in your vault. Create structured .arx notes, or read and edit markdown alongside them.
      </p>

      <div class="welcome-actions">
        <Button @click="createNote">New note</Button>
        <Button v-if="shell.types.has(SEARCH_TYPE_ID)" variant="secondary" @click="shell.workspace.activateType(SEARCH_TYPE_ID)">Find a note</Button>
      </div>
      <p class="next">Use Vault to browse files, or Open or switch to to reach all your tools.</p>

      <!-- Desktop only: a phone has no keyboard to press these on until something is focused, and the
           list would be five rows of noise on the smaller screen. -->
      <dl v-if="!mobile" class="shortcuts">
        <div v-for="shortcut in SHORTCUTS" :key="shortcut.does" class="shortcut">
          <dt>
            <kbd>{{ hotkeys.label(shortcut.chord) }}</kbd>
          </dt>
          <dd>{{ shortcut.does }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.welcome-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 24px;
  overflow-y: auto;
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
