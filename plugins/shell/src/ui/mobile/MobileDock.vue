<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'

// The strip above the type row, holding only the key that reveals the active mini-app's own
// navigation (its file tree, its settings-section list — named by the mini-app itself via
// claimRailHost(), never generically "Files"). Split out of the tab row rather than mixed in with the
// mini-app switcher: "navigate within where I am" and "switch to a different place" are different
// questions, and the row answering the second one was where this key used to live.
//
// The parent only renders this strip at all when there is a rail to claim it — an empty 40px band
// above the row would cost real space for nothing, on the frame with the least of it to spare.
defineProps<{ icon: string; title: string; active: boolean }>()
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <div class="dock" data-testid="dock">
    <button
      type="button"
      class="nav-key"
      :class="{ active }"
      data-testid="arxhub.shell.rail"
      :aria-label="title"
      :aria-pressed="active"
      @click="emit('open')"
    >
      <span class="nav-key-glyph">
        <Icon :name="icon" :size="14" />
      </span>
      <span class="nav-key-label">{{ title }}</span>
    </button>
  </div>
</template>

<style scoped>
.dock {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: var(--size-md);
  padding: 0 8px;
  border-top: 1px solid var(--gray-6);
  background: var(--gray-2);
}

.nav-key {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--size-xs);
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

/* Raised fill, not the accent: this is "open on top of where I am", the same treatment the type row's
   own layer keys (More) use — the accent stays reserved for "where I am" alone. */
.nav-key.active {
  background: var(--gray-4);
  color: var(--gray-12);
}

.nav-key:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.nav-key-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
