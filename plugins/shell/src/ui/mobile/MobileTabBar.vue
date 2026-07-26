<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import type { MobileTab } from '../extension'

const props = defineProps<{ tabs: MobileTab[] }>()

// A count is part of what the key says, so it belongs in the accessible name rather than only in the
// badge — "Notes" and "Notes, 3 open" are different controls to someone who cannot see the dot.
function label(tab: MobileTab): string {
  const count = tab.badge?.() ?? 0
  return count > 0 ? `${tab.title}, ${count} open` : tab.title
}
</script>

<template>
  <nav class="tab-bar" aria-label="Navigation">
    <button
      v-for="tab in props.tabs"
      :key="tab.id"
      type="button"
      class="tab"
      :class="{ active: tab.active?.() }"
      :data-testid="tab.id"
      :aria-label="label(tab)"
      :aria-pressed="tab.active ? tab.active() : undefined"
      @click="tab.onSelect()"
    >
      <span class="tab-glyph">
        <Icon :name="tab.icon" :size="16" />
        <span v-if="(tab.badge?.() ?? 0) > 0" class="tab-badge" aria-hidden="true">{{ tab.badge?.() }}</span>
      </span>
      <span class="tab-label">{{ tab.title }}</span>
    </button>
  </nav>
</template>

<style scoped>
/* The browser pattern: everything reachable sits in the bottom third, and the strip below the keys is
   left to the device's own home indicator. */
.tab-bar {
  display: flex;
  flex-shrink: 0;
  padding-top: 4px;
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--gray-6);
  background: var(--gray-2);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: var(--size-xl);
  border: none;
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  cursor: pointer;
}

/* The accent is spent on selection, so an open layer is what colours its key. */
.tab.active {
  color: var(--accent-11);
}

.tab:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.tab-glyph {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-badge {
  position: absolute;
  top: -4px;
  left: 12px;
  min-width: 16px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--accent-9);
  color: var(--accent-contrast);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

/* Below the token scale on purpose: a key's label is a hint under a glyph, not body text. */
.tab-label {
  font-size: 11px;
  line-height: var(--line-height-none);
}
</style>
