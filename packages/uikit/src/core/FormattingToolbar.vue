<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import DesktopFormattingToolbar from './DesktopFormattingToolbar.vue'
import type { FormattingAction } from './formatting-action'
import MobileFormattingToolbar from './MobileFormattingToolbar.vue'

withDefaults(
  defineProps<{
    actions: FormattingAction[]
    /** strip — fills a Strip band (lg). bubble — compact floating chrome (sm on desktop). */
    variant?: 'strip' | 'bubble'
  }>(),
  { variant: 'strip' },
)

const impl = useShellFrame() === 'mobile' ? MobileFormattingToolbar : DesktopFormattingToolbar
</script>

<template>
  <component :is="impl" :actions="actions" :variant="variant" />
</template>
