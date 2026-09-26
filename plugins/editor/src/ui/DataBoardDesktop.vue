<script setup lang="ts">
import { Row, ScrollArea } from '@arxhub/uikit/core'
import type { ArxDataItem } from '../data-sources'

defineProps<{ groups: { title: string; items: ArxDataItem[] }[] }>()
const emit = defineEmits<{ open: [item: ArxDataItem] }>()
</script>
<template>
  <ScrollArea axis="x" class="data-board">
    <div class="data-board-grid" aria-label="Grouped results" :style="{ minWidth: `${groups.length * 216 - 16}px` }"><section v-for="group in groups" :key="group.title"><h3>{{ group.title }} · {{ group.items.length }}</h3><Row v-for="item in group.items" :key="item.id" as="button" type="button" wrap @click="emit('open', item)">{{ item.title }}</Row></section></div>
  </ScrollArea>
</template>
<style scoped>
/* The area's content is fit-content wide, and a wrapping title's unwrapped length would widen its column
   past its share. Contained, the grid is as wide as the box or its columns' 200px floors, as it was when
   it was the scroller itself. The bottom inset is the overlay bar's hit height, so its track lies over
   empty space rather than over the last row. */
.data-board-grid { padding-bottom: 12px; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(200px, 1fr); gap: 16px; contain: inline-size; }
section { min-width: 0; }
h3 { margin-block: 8px; font-size: var(--font-size-sm); color: var(--gray-11); }
</style>
