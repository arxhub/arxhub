<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import { MAX_HIGHLIGHT_LENGTH } from '../code-highlighting'
import type { ArxEditorControlProps } from '../control-views'

defineProps<ArxEditorControlProps>()
const touch = useShellFrame() === 'mobile'
</script>

<template>
  <span class="language-label" :class="{ touch }">{{ node.attrs.language || 'Plain text' }}</span>
  <span v-if="node.content.size > MAX_HIGHLIGHT_LENGTH" class="language-label" :class="{ touch }">Syntax highlighting paused for this large block.</span>

</template>

<style scoped>
nav { margin-top: 8px; max-height: 280px; overflow: auto; }
.language-label { font-size: var(--font-size-xs); color: var(--gray-11); padding: 8px; display: block; }
.language-label.touch { font-size: var(--font-size-sm); }
</style>
