<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'

import type { TileGridItem } from './tile-grid'

// A choice among kinds of thing, each named by a glyph and a short label — the phone's "insert a block".
// Four to a row at the touch frame's width, so a dozen kinds fit in one screen without scrolling.

const COLUMNS = 4

const props = defineProps<{ items: readonly TileGridItem[]; activeId?: string; label: string }>()
const emit = defineEmits<{ select: [id: string]; highlight: [id: string] }>()
const root = ref<HTMLElement | null>(null)

// One tab stop for the whole grid, the way a listbox is one: the highlighted tile, else the first that acts.
const stop = computed(() => {
  const active = props.items.find((item) => item.id === props.activeId && !item.disabled)
  return (active ?? props.items.find((item) => !item.disabled))?.id
})

function tiles(): HTMLButtonElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLButtonElement>('.tile') ?? [])
}

// Arrows skip a disabled tile rather than stopping on it, and stop at the ends rather than wrapping — the
// grid is a picture of where things are, and wrapping from the last tile to the first breaks it.
function move(from: number, step: number): void {
  const all = tiles()
  for (let index = from + step; index >= 0 && index < all.length; index += step) {
    if (!props.items[index]?.disabled) {
      all[index]?.focus()
      return
    }
  }
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }
  if (event.key in steps) {
    event.preventDefault()
    move(index, steps[event.key] ?? 0)
  } else if (event.key === 'Home') {
    event.preventDefault()
    move(-1, 1)
  } else if (event.key === 'End') {
    event.preventDefault()
    move(props.items.length, -1)
  }
}
</script>

<template>
  <div ref="root" class="tile-grid" role="listbox" :aria-label="label">
    <button
      v-for="(item, index) in items"
      :key="item.id"
      type="button"
      class="tile"
      role="option"
      :class="{ active: item.id === activeId }"
      :aria-selected="item.id === activeId"
      :disabled="item.disabled"
      :tabindex="item.id === stop ? 0 : -1"
      @click="emit('select', item.id)"
      @focus="emit('highlight', item.id)"
      @keydown="onKeydown($event, index)"
    >
      <Icon :name="item.icon" :size="16" />
      <span class="tile-label">{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.tile-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 16px 16px;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: var(--size-2xl);
  padding: 4px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
  color: var(--gray-12);
  font: inherit;
  cursor: pointer;
}

.tile-label {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  max-width: 100%;
  text-align: center;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  overflow-wrap: anywhere;
}

.tile:hover:not(:disabled) {
  background: var(--gray-4);
}

.tile.active {
  background: var(--accent-3);
  color: var(--accent-11);
}

.tile:disabled {
  background: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}

.tile:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}
</style>
