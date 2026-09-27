<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Button, ScrollArea, Strip } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { describeFunction } from '../formula-help'
import { t } from '../i18n/messages'
import { useFormulaAssist } from './use-formula-assist'

const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const { formulaFocused, draft, composing, help, refs, colors, complete } = useFormulaAssist()
</script>
<template>
  <Strip v-if="formulaFocused && draft.startsWith('=') && !composing" class="sheet-formula-help">
    <ScrollArea axis="x" class="sheet-help-content">
      <span v-if="help.fn" :title="describeFunction(help.fn.name)">{{ t('formula.argument', { signature: help.fn.signature, n: help.argument }) }}</span>
      <span v-else-if="!help.suggestions.length" class="sheet-reference-legend"><code v-for="(reference, i) in refs" :key="reference.start" :style="{ color: colors[i % colors.length] }">{{ reference.text }}</code><span v-if="!refs.length">{{ t('formula.pointHint') }}</span></span>
      <span v-else>{{ t('formula.complete') }}</span>
    </ScrollArea>
    <template #actions><Button v-for="fn in help.suggestions" :key="fn.name" :size="buttonSize" variant="secondary" :title="describeFunction(fn.name)" @pointerdown.prevent @click="complete(fn.name)">{{ fn.name }}</Button></template>
  </Strip>
</template>
<style scoped>
.sheet-help-content { white-space: nowrap; color: var(--gray-11); font-size: var(--font-size-xs); }
.sheet-reference-legend { display: flex; gap: 12px; }
</style>
