<script setup lang="ts">
import { NavItem } from '@arxhub/uikit/core'
import type { TypeRowItem } from '../workspace'

// The first level of navigation. The same set of types the phone puts in a row along the bottom, stood
// on its side — one model, two layouts. Both levels are visible at once here, which is the whole reason
// the rail exists: the types beside the window, the active type's objects as the tab strip above the
// content.
const props = defineProps<{ row: TypeRowItem[] }>()
defineEmits<{ select: [typeId: string]; sheet: [] }>()

// A count is part of what the key says, so it belongs in the accessible name and not only in the
// badge — "Notes" and "Notes, 3 open" are different controls to someone who cannot see the dot.
function label(item: TypeRowItem): string {
  return item.count > 0 ? `${item.type.title}, ${item.count} open` : item.type.title
}
</script>

<template>
  <nav class="type-rail" aria-label="Types">
    <div v-for="item in props.row" :key="item.type.id" class="type">
      <NavItem
        :icon="item.type.icon"
        :title="label(item)"
        :active="item.active"
        :data-testid="`type-${item.type.id}`"
        @click="$emit('select', item.type.id)"
      />
      <!-- Zero is never drawn: an empty badge would say "a number belongs here", which is not a
           number. -->
      <span v-if="item.count > 0" class="count" aria-hidden="true">{{ item.count > 99 ? '99+' : item.count }}</span>
    </div>
    <NavItem icon="lu:layout-grid" title="Open or switch to" @click="$emit('sheet')" />
  </nav>
</template>

<style scoped>
.type-rail {
  /* +1px: border-box counts the border in the width, so without it the 40px key overflows past the
     seam and the border renders underneath the key's own fill instead of beside it. */
  width: calc(var(--size-md) + 1px);
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  overflow-y: auto;
  background-color: var(--gray-2);
  border-right: 1px solid var(--gray-6);
  z-index: var(--z-index-docked);
  scrollbar-width: none;
}

.type-rail::-webkit-scrollbar {
  display: none;
}

.type {
  position: relative;
  display: flex;
  flex-shrink: 0;
}

/* Not the accent. In this rail the accent means exactly one thing — "where I am" — and it is already
   spent on the active key (F-17). A badge wearing it too would put three accent marks on the rail
   answering a different question each. */
.count {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 16px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--gray-7);
  color: var(--gray-12);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}
</style>
