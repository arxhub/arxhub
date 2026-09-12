<script setup lang="ts">
import SheetBar from './SheetBar.vue'
import SheetFormulaBar from './SheetFormulaBar.vue'
import SheetFormulaHelp from './SheetFormulaHelp.vue'
import SheetGrid from './SheetGrid.vue'
import SheetMessages from './SheetMessages.vue'
import SheetTabs from './SheetTabs.vue'
import { useSheet } from './use-sheet'

const { root, sheet } = useSheet()
</script>

<template>
  <div ref="root" class="sheet-editor">
    <SheetBar />
    <SheetMessages />
    <SheetFormulaBar />
    <SheetFormulaHelp />
    <SheetGrid v-if="sheet" :row-height="32" :column-width="120" />
    <SheetTabs />
  </div>
</template>

<style scoped>
.sheet-editor { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; overflow: hidden; background: var(--gray-1); }
</style>
