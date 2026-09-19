<script setup lang="ts">
import { Button, Strip } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { useFormulaAssist } from './use-formula-assist'

const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const { formulaFocused, draft, composing, help, refs, colors, complete } = useFormulaAssist()
</script>
<template>
  <Strip v-if="formulaFocused && draft.startsWith('=') && !composing" class="sheet-formula-help">
    <div class="sheet-help-content">
      <span v-if="help.fn" :title="help.fn.description">{{ help.fn.signature }} · argument {{ help.argument }}</span>
      <span v-else-if="!help.suggestions.length" class="sheet-reference-legend"><code v-for="(reference, i) in refs" :key="reference.start" :style="{ color: colors[i % colors.length] }">{{ reference.text }}</code><span v-if="!refs.length">Click a cell or drag a range · F4 locks references</span></span>
      <span v-else>Tab completes</span>
    </div>
    <template #actions><Button v-for="fn in help.suggestions" :key="fn.name" :size="buttonSize" variant="secondary" :title="fn.description" @pointerdown.prevent @click="complete(fn.name)">{{ fn.name }}</Button></template>
  </Strip>
</template>
<style scoped>
.sheet-help-content { min-width: 0; overflow: auto; white-space: nowrap; color: var(--gray-11); font-size: var(--font-size-xs); }
.sheet-reference-legend { display: flex; gap: 12px; }
</style>
