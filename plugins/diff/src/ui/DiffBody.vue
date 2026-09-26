<script setup lang="ts">
import { EmptyState, ScrollArea } from '@arxhub/uikit/core'
import { computed } from 'vue'
import BlockSideBySide from './BlockSideBySide.vue'
import BlockStream from './BlockStream.vue'
import { DIFF_LABELS } from './labels'
import ReplacedView from './ReplacedView.vue'
import SheetBody from './SheetBody.vue'
import TextSideBySide from './TextSideBySide.vue'
import TextStream from './TextStream.vue'
import { useDiffViewContext } from './use-diff-view'

// What both frames draw under their chrome. `sideBySide` is the frame's answer (the phone has no room for two
// columns), not the reader's: the reader's choice is `controller.layout`.
const props = defineProps<{ leftLabel: string; rightLabel: string; sideBySide: boolean }>()
const { controller } = useDiffViewContext()

const model = computed(() => controller.model.value)
const side = computed(() => props.sideBySide && controller.layout.value === 'side')
const tab = computed(() => {
  const value = model.value
  if (value?.format !== 'sheets') return null
  return value.tabs.find((it) => it.id === controller.tabId.value) ?? value.tabs[0] ?? null
})
</script>

<template>
  <div class="diff-body">
    <EmptyState v-if="model == null || model.identical" icon="lu:check" :text="DIFF_LABELS.identical" data-testid="diff-empty" />
    <template v-else-if="model.format === 'sheets'">
      <SheetBody v-if="tab" :key="tab.id" :tab="tab" :book-note="model.note" />
    </template>
    <ScrollArea v-else class="diff-scroll">
      <BlockSideBySide v-if="model.format === 'blocks' && side" :model="model" :left-label="leftLabel" :right-label="rightLabel" />
      <BlockStream v-else-if="model.format === 'blocks'" :model="model" />
      <TextSideBySide v-else-if="model.format === 'text' && side" :model="model" :left-label="leftLabel" :right-label="rightLabel" />
      <TextStream v-else-if="model.format === 'text'" :model="model" />
      <ReplacedView v-else :model="model" :left-label="leftLabel" :right-label="rightLabel" />
    </ScrollArea>
  </div>
</template>

<style scoped>
.diff-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--gray-1);
}

.diff-scroll {
  flex: 1 1 auto;
}
</style>
