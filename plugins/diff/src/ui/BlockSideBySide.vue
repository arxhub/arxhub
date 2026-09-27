<script setup lang="ts">
import { alignBlocks } from '../align'
import type { DiffBlocksModel } from '../model'
import BlockUnit from './BlockUnit.vue'
import { stopTargets } from './block-view'
import DiffFold from './DiffFold.vue'
import { foldBlocksLabel } from './labels'
import { useDiffViewContext, useFolds } from './use-diff-view'

const props = defineProps<{ model: DiffBlocksModel; leftLabel: string; rightLabel: string }>()
const { controller, settings } = useDiffViewContext()

// Folds the whole list, ghosts included — a ghost is a drawn row here; a unit then becomes its aligned row.
const entries = useFolds(() => props.model.units, {
  isChange: (unit) => unit.change !== 'equal',
  context: () => settings.value.contextBlocks,
  scope: () => 'blocks',
  targetsOf: (unit) => stopTargets(unit),
})
</script>

<template>
  <div class="block-side">
    <div class="head">{{ leftLabel }}</div>
    <div class="head right">{{ rightLabel }}</div>
    <template v-for="entry in entries" :key="entry.kind === 'fold' ? entry.id : entry.item.id">
      <div v-if="entry.kind === 'fold'" class="full">
        <DiffFold :label="foldBlocksLabel(entry.count)" @expand="controller.expand(entry.id)" />
      </div>
      <template v-else>
        <template v-for="row in alignBlocks([entry.item])" :key="row.id">
          <BlockUnit v-if="row.left.kind === 'item'" :unit="row.left.item" side="left" />
          <!-- A blank is drawn, not left empty: a colour-only absence cannot be read without the colour. -->
          <div v-else class="blank" aria-hidden="true" />
          <BlockUnit v-if="row.right.kind === 'item'" :unit="row.right.item" side="right" />
          <div v-else class="blank" aria-hidden="true" />
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.block-side {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  padding-bottom: 8px;
}

.head {
  margin-bottom: 8px;
  padding: 8px 20px 4px;
  border-bottom: 1px solid var(--gray-4);
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.head.right {
  border-left: 1px solid var(--gray-4);
}

.full {
  grid-column: 1 / -1;
}

.blank {
  min-height: var(--size-2xs);
  margin: 0 8px 4px;
  border: 1px dashed var(--gray-6);
  border-radius: var(--radius-xs);
  box-sizing: border-box;
}
</style>
