<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'

// The frame is already decided and published at boot, so the copy can name the control the reader is
// actually looking at instead of describing both and leaving them to work out which one they have.
const mobile = useShellFrame() === 'mobile'

// Only chords that are really bound — an empty state listing a shortcut the app does not answer is
// worse than one listing none. The open key is global and works from anywhere, save is in both editors,
// the formatting chords are markdown-only, and F2 belongs to the file tree.
const SHORTCUTS: { keys: string[]; does: string }[] = [
  { keys: ['Ctrl', 'K'], does: 'Open or switch to' },
  { keys: ['Ctrl', 'S'], does: 'Save the open file' },
  { keys: ['Ctrl', 'B'], does: 'Bold' },
  { keys: ['Ctrl', 'I'], does: 'Italic' },
  { keys: ['Ctrl', 'Shift', 'K'], does: 'Insert a link' },
  { keys: ['F2'], does: 'Rename in the file tree' },
]
</script>

<template>
  <div class="welcome-panel">
    <div class="sheet">
      <h1>ArxHub</h1>
      <p class="lede">
        A local-first markdown vault. Every note is a plain file on disk — no database, no lock-in, and
        nothing leaves this device until you set up sync.
      </p>

      <p class="next">
        {{
          mobile
            ? 'Tap Vault to browse the notes, or Search to find one.'
            : 'Open a note from the file tree, or search the vault from the rail on the left.'
        }}
      </p>

      <!-- Desktop only: a phone has no keyboard to press these on until something is focused, and the
           list would be five rows of noise on the smaller screen. -->
      <dl v-if="!mobile" class="shortcuts">
        <div v-for="shortcut in SHORTCUTS" :key="shortcut.does" class="shortcut">
          <dt>
            <kbd v-for="key in shortcut.keys" :key="key">{{ key }}</kbd>
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
