<script setup lang="ts">
import SheetFormulaBar from './SheetFormulaBar.vue'
import SheetFormulaHelp from './SheetFormulaHelp.vue'
import SheetGrid from './SheetGrid.vue'
import SheetMessages from './SheetMessages.vue'
import { useSheet } from './use-sheet'
import { useSheetBar } from './use-sheet-bar'

// No strip at the top: the name is the object band's, and nothing the thumb reaches for sits up there.
const props = defineProps<{ path: string }>()
const session = useSheet()
const { root, sheet } = session
useSheetBar(() => props.path, session)
</script>

<template>
  <div ref="root" class="sheet-editor sheet-mobile">
    <SheetMessages />
    <SheetGrid v-if="sheet" :row-height="48" :column-width="120" />
    <SheetFormulaHelp />
    <SheetFormulaBar />
  </div>
</template>

<style scoped>
.sheet-editor { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; overflow: hidden; background: var(--gray-1); }
.sheet-mobile { font-size: var(--font-size-md); }
</style>
