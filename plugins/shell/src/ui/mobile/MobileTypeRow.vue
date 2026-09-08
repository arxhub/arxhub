<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import type { TypeRowItem } from '../workspace'

const props = defineProps<{ row: TypeRowItem[]; sheetOpen: boolean }>()
const emit = defineEmits<{ select: [typeId: string]; peek: [typeId: string]; sheet: [] }>()

// A count is part of what the key says, so it belongs in the accessible name and not only in the
// badge — "Notes" and "Notes, 3 open" are different controls to someone who cannot see the dot.
function label(item: TypeRowItem): string {
  return item.count > 0 ? `${item.type.title}, ${item.count} open` : item.type.title
}

// Tapping your own type a second time opens the list of what is open inside it — the second level. A
// type that never declared the "what is open" role has no second level, and a second tap does nothing.
function tap(item: TypeRowItem): void {
  if (item.active && item.type.open != null) emit('peek', item.type.id)
  else emit('select', item.type.id)
}
</script>

<template>
  <nav class="type-row" aria-label="Types">
    <!-- The types scroll rather than squeeze. A key in this row is the most frequent target on the
         screen and must never fall below the touch minimum: dividing 412px between eight types gives
         46px and between nine gives 41px, so the row broke exactly when there were many of them. -->
    <div class="types">
      <button
        v-for="item in props.row"
        :key="item.type.id"
        type="button"
        class="key type"
        :class="{ active: item.active }"
        :data-testid="`type-${item.type.id}`"
        :aria-label="label(item)"
        :aria-pressed="item.active"
        @click="tap(item)"
      >
        <span class="glyph">
          <Icon :name="item.type.icon" :size="16" />
          <span v-if="item.count > 0" class="count" aria-hidden="true">{{ item.count > 99 ? '99+' : item.count }}</span>
        </span>
        <!-- The label is on the active one only: seven labels at once turn the row into mush, and on
             the active one the label is what answers "where am I". -->
        <span v-if="item.active" class="label">{{ item.type.title }}</span>
      </button>
    </div>

    <!-- Immobile, and immobile in the literal sense: it sits outside the scrolling ribbon, so its
         width does not depend on how many types are open. It is the way to everything that is not on
         the screen right now: what is open elsewhere, every type with no place in the row, and the
         status block this frame has no permanent bar for.
         The palette glyph rather than a magnifier: the magnifier belongs to the Search type, which
         stands in this very row, and one glyph answering two things is worse than an unfamiliar one. -->
    <button
      type="button"
      class="key opener"
      :class="{ active: props.sheetOpen }"
      data-testid="arxhub.shell.search"
      aria-label="Open or switch to"
      :aria-pressed="props.sheetOpen"
      @click="emit('sheet')"
    >
      <span class="glyph"><Icon name="lu:command" :size="16" /></span>
    </button>
  </nav>
</template>

<style scoped>
/* The browser pattern: everything reachable sits in the bottom third, and the strip below the keys is
   left to the device's own home indicator. */
.type-row {
  display: flex;
  flex-shrink: 0;
  align-items: stretch;
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--gray-6);
  background: var(--gray-2);
}

.types {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: stretch;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.types::-webkit-scrollbar {
  display: none;
}

.key {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: var(--size-xl);
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  cursor: pointer;
}

/* Grows while there are few types, and never shrinks below the touch minimum when there are many. */
.type {
  flex: 1 0 64px;
  min-width: 64px;
}

/* Where I am: the accent wash plus accent text, the same selection treatment every row and tab in the
   app uses. Exactly one at a time (F-17). */
.type.active {
  background: var(--accent-3);
  color: var(--accent-11);
}

/* Not a place you can be in, so it never takes the accent: what it opens is a layer ON TOP of where
   you are, and a raised fill is how a layer states itself (F-17). */
.opener {
  flex: 0 0 var(--size-xl);
  width: var(--size-xl);
  border-left: 1px solid var(--gray-6);
  border-radius: 0;
}

.opener.active {
  background: var(--gray-4);
  color: var(--gray-12);
}

.key:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.glyph {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* NOT the accent. The accent in this row means exactly one thing — "where I am" — and it is already
   spent on the active type. A badge wearing it on three inactive types would put four accent marks in
   the row, three of them answering a different question. */
.count {
  position: absolute;
  top: -6px;
  left: 12px;
  min-width: 16px;
  max-width: 28px;
  overflow: hidden;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--gray-7);
  color: var(--gray-12);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: center;
}

/* A key's label is a hint under a glyph, not body text. */
.label {
  max-width: 100%;
  overflow: hidden;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-none);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
