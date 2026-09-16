<script setup lang="ts">
import { DocumentName } from '@arxhub/plugin-notes/ui'
import { Strip } from '@arxhub/uikit/core'
import { useKeyboardInset } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import SheetBar from './SheetBar.vue'
import SheetFormulaBar from './SheetFormulaBar.vue'
import SheetFormulaHelp from './SheetFormulaHelp.vue'
import SheetGrid from './SheetGrid.vue'
import SheetMessages from './SheetMessages.vue'
import SheetTabs from './SheetTabs.vue'
import { useSheet } from './use-sheet'

defineProps<{ path: string }>()
const { root, sheet, formulaFocused } = useSheet()
const keyboardInset = useKeyboardInset()
const typing = computed(() => formulaFocused.value && keyboardInset.value > 0)
</script>

<template>
  <div ref="root" class="sheet-editor sheet-mobile">
    <Strip>
      <DocumentName :path="path" />
    </Strip>
    <SheetMessages />
    <SheetGrid v-if="sheet" :row-height="48" :column-width="120" />
    <SheetTabs v-show="!typing" />
    <SheetFormulaHelp />
    <SheetFormulaBar />
    <SheetBar v-show="!typing" />
  </div>
</template>

<style scoped>
.sheet-editor { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; overflow: hidden; background: var(--gray-1); }
.sheet-mobile { font-size: var(--font-size-md); }
</style>
