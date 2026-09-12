<script setup lang="ts">
import { IconButton, Input, Strip } from '@arxhub/uikit/core'
import { useId } from 'vue'
import { MAX_INPUT } from '../model'
import { useFormulaAssist } from './use-formula-assist'
import { useSheet } from './use-sheet'

const { inputRoot, activeAddress, draft, editable, commit, cancelEdit, finishEdit, focusFormula, blurFormula, composing, position, keydown } =
  useFormulaAssist()
const id = useId()
const { formulaFocused, grid } = useSheet()
function applyCell() {
  if (commit()) grid.value?.focus({ preventScroll: true })
}
</script>

<template>
  <Strip class="sheet-formula" flush-actions @focusout="blurFormula">
    <label :for="`${id}-formula`" class="sheet-address">{{ activeAddress }}</label>
    <div ref="inputRoot" class="sheet-input">
      <Input :id="`${id}-formula`" v-model="draft" aria-label="Cell value or formula" :disabled="!editable"
        :maxlength="MAX_INPUT" placeholder="Value or =SUM(A1:A10)" autocomplete="off" autocapitalize="off" :spellcheck="false"
        @keydown="keydown" @keyup="position" @click="position" @select="position" @keydown.enter="!$event.isComposing && finishEdit()" @keydown.esc.prevent="cancelEdit"
        @focus="focusFormula(); position()" @compositionstart="composing = true" @compositionend="composing = false" />
    </div>
    <template #actions>
      <IconButton v-if="formulaFocused" size="lg" icon="lu:x" tooltip="Cancel cell edit" :disabled="!editable" @pointerdown.prevent @click="cancelEdit" />
      <IconButton size="lg" icon="lu:check" tooltip="Apply cell" :disabled="!editable" @pointerdown.prevent @click="applyCell" />
    </template>
  </Strip>

</template>

<style scoped>
.sheet-address { width: 48px; flex-shrink: 0; font-family: var(--font-mono); color: var(--gray-11); font-size: var(--font-size-xs); }
.sheet-input { flex: 1; min-width: 0; }
</style>
