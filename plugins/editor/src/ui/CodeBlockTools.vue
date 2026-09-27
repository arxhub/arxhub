<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import { MAX_HIGHLIGHT_LENGTH } from '../code-highlighting'
import type { ArxEditorControlProps } from '../control-views'
import { t } from '../i18n/messages'

defineProps<ArxEditorControlProps>()
const touch = useShellFrame() === 'mobile'
</script>

<template>
  <span class="language-label" :class="{ touch }">{{ node.attrs.language || t('settings.plainText') }}</span>
  <span v-if="node.content.size > MAX_HIGHLIGHT_LENGTH" class="language-label" :class="{ touch }">{{ t('codeBlock.highlightingPaused') }}</span>

</template>

<style scoped>
.language-label { font-size: var(--font-size-xs); color: var(--gray-11); padding: 8px; display: block; }
.language-label.touch { font-size: var(--font-size-sm); }
</style>
