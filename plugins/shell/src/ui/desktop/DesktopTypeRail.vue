<script setup lang="ts">
import { readText } from '@arxhub/i18n'
import { NavItem, ScrollArea } from '@arxhub/uikit/core'
import { t } from '../../i18n/messages'
import type { TypeRowItem } from '../workspace'

// The first level of navigation. The same set of types the phone puts in a row along the bottom, stood
// on its side — one model, two layouts. Both levels are visible at once here, which is the whole reason
// the rail exists: the types beside the window, the active type's objects as the tab strip above the
// content.
const props = defineProps<{ row: TypeRowItem[] }>()
defineEmits<{ select: [typeId: string]; sheet: [] }>()

// A count is part of what the key says, so it belongs in the accessible name and not only in the
// badge — "Documents" and "Documents, 3 open" are different controls to someone who cannot see the dot.
function label(item: TypeRowItem): string {
  const title = readText(item.type.title)
  return item.count > 0 ? t('typeOpen', { title, count: item.count }) : title
}
</script>

<template>
  <nav class="type-rail" :aria-label="t('types')">
    <ScrollArea passive class="type-scroll" content-class="type-list">
      <NavItem
        v-for="item in props.row"
        :key="item.type.id"
        :icon="item.type.icon"
        :title="label(item)"
        :active="item.active"
        :count="item.count"
        :data-testid="`type-${item.type.id}`"
        @click="$emit('select', item.type.id)"
      />
      <NavItem icon="lu:layout-grid" :title="t('sheet.title')" @click="$emit('sheet')" />
    </ScrollArea>
  </nav>
</template>

<style scoped>
.type-rail {
  /* +1px: border-box counts the border in the width, so without it the 40px key overflows past the
     seam and the border renders underneath the key's own fill instead of beside it. */
  width: calc(var(--size-md) + 1px);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background-color: var(--gray-2);
  border-right: 1px solid var(--gray-6);
  z-index: var(--z-index-docked);
}

.type-scroll {
  flex: 1;
}

.type-scroll :deep(.type-list) {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
