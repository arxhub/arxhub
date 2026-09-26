<script setup lang="ts">
import { EmptyState } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { DiffSheetTab } from '../model'
import { DIFF_LABELS, sheetAddedLabel, sheetRemovedLabel, sheetRenamedLabel } from './labels'
import SheetGrid from './SheetGrid.vue'
import SheetList from './SheetList.vue'
import { useDiffViewContext } from './use-diff-view'

const props = defineProps<{ tab: DiffSheetTab; bookNote?: string }>()
const { controller, touch } = useDiffViewContext()

// A rename, a restyle and a change of the workbook leave no cell stop behind, so the banner is the only place
// they are said.
const banner = computed(() => {
  const tab = props.tab
  const lines: string[] = []
  if (tab.status === 'added') lines.push(sheetAddedLabel(tab.filled.after))
  else if (tab.status === 'removed') lines.push(sheetRemovedLabel(tab.filled.before))
  else if (tab.previousName != null) lines.push(sheetRenamedLabel(tab.previousName, tab.name))
  if (tab.note != null) lines.push(tab.note)
  if (props.bookNote != null) lines.push(props.bookNote)
  return lines.length ? lines.join(' · ') : null
})
// "No changes" beside a banner that names one would contradict it: only the values stayed.
const empty = computed(() => (banner.value == null ? DIFF_LABELS.noChangesOnSheet : DIFF_LABELS.noValueChangesOnSheet))
</script>

<template>
  <div class="sheet-body" :class="{ touch }">
    <div v-if="banner" class="banner">{{ banner }}</div>
    <EmptyState v-if="tab.stops.length === 0" icon="lu:check" :text="empty" data-testid="diff-empty" />
    <SheetGrid v-else-if="controller.sheetView.value === 'grid'" :tab="tab" />
    <SheetList v-else :tab="tab" />
  </div>
</template>

<style scoped>
.sheet-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.banner {
  flex: none;
  padding: 8px 12px;
  border-bottom: 1px solid var(--gray-4);
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.touch .banner {
  padding: 8px 16px;
}
</style>
