<script setup lang="ts">
import type { DiffBlocksModel } from '../model'
import BlockUnit from './BlockUnit.vue'
import { stopTargets } from './block-view'
import DiffFold from './DiffFold.vue'
import { foldLabel } from './labels'
import { useDiffViewContext, useFolds } from './use-diff-view'

const props = defineProps<{ model: DiffBlocksModel }>()
const { controller, settings } = useDiffViewContext()

// The stream never draws a ghost, so it folds the units without them: counting a ghost as a change would keep
// context around a place where nothing is drawn. Its own scope, since the side-by-side folds the list with ghosts.
const entries = useFolds(() => props.model.units.filter((unit) => unit.ghost !== true), {
  isChange: (unit) => unit.change !== 'equal',
  context: () => settings.value.contextBlocks,
  scope: () => 'stream',
  targetsOf: (unit) => stopTargets(unit),
})
</script>

<template>
  <div class="block-stream">
    <template v-for="entry in entries" :key="entry.kind === 'fold' ? entry.id : entry.item.id">
      <DiffFold v-if="entry.kind === 'fold'" :label="foldLabel(entry.count, 'blocks')" @expand="controller.expand(entry.id)" />
      <BlockUnit v-else :unit="entry.item" />
    </template>
  </div>
</template>

<style scoped>
.block-stream {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}
</style>
