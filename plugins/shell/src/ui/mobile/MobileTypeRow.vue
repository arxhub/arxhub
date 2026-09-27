<script setup lang="ts">
import { readText } from '@arxhub/i18n'
import { NavItem } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { t } from '../../i18n/messages'
import type { TypeRowItem } from '../workspace'
import { fitTypeRow } from './type-row'

const props = defineProps<{ row: TypeRowItem[]; moreOpen: boolean }>()
const emit = defineEmits<{ select: [typeId: string]; again: [typeId: string]; more: [] }>()

// A few keys and More, never a ribbon to scroll: a key in this row is the most frequent target on the
// screen, and one that has scrolled out of sight is not a target at all. What does not fit is one tap
// away behind More, which says how many.
const fitted = computed(() => fitTypeRow(props.row))

// Icons only, so the name has to be in the accessible name — and so does the count, which is part of
// what the key says: "Documents" and "Documents, 3 open" are different controls to someone who cannot
// see the badge.
function label(item: TypeRowItem): string {
  const title = readText(item.type.title)
  return item.count > 0 ? t('typeOpen', { title, count: item.count }) : title
}

// A second tap on your own type opens its second level — what a tap on the tab counter does in a phone's
// browser. The frame decides whether that type has one.
function tap(item: TypeRowItem): void {
  if (item.active) emit('again', item.type.id)
  else emit('select', item.type.id)
}
</script>

<template>
  <nav class="type-row" :aria-label="t('types')">
    <NavItem
      v-for="item in fitted.shown"
      :key="item.type.id"
      :icon="item.type.icon"
      :title="label(item)"
      :active="item.active"
      :count="item.count"
      :data-testid="`type-${item.type.id}`"
      @click="tap(item)"
    />
    <!-- The way to everything that has no key right now: the types that did not fit, the ones not open
         yet, and the status block this frame has no permanent bar for. -->
    <NavItem
      icon="lu:ellipsis"
      :title="fitted.hidden > 0 ? t('moreHidden', { count: fitted.hidden }) : t('more')"
      :open="props.moreOpen"
      :count="fitted.hidden"
      data-testid="arxhub.shell.search"
      @click="emit('more')"
    />
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
</style>
