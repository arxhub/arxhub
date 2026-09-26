<script setup lang="ts">
import { computed } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'
import DesktopFormattingToolbar from './DesktopFormattingToolbar.vue'
import type { FormattingAction } from './formatting-action'
import MobileFormattingToolbar from './MobileFormattingToolbar.vue'

const props = withDefaults(
  defineProps<{
    actions: FormattingAction[]
    /** strip — fills a Strip band (lg). bubble — compact floating chrome (sm on desktop). */
    variant?: 'strip' | 'bubble'
    /** Phone only: the desktop keeps undo on its chords and has no on-screen keyboard to put away. */
    history?: FormattingAction[]
    dismissKeyboard?: boolean
  }>(),
  { variant: 'strip', history: () => [], dismissKeyboard: false },
)

const mobile = useShellFrame() === 'mobile'
const impl = mobile ? MobileFormattingToolbar : DesktopFormattingToolbar
const touchOnly = computed(() => (mobile ? { history: props.history, dismissKeyboard: props.dismissKeyboard } : {}))
</script>

<template>
  <component :is="impl" :actions="actions" :variant="variant" v-bind="touchOnly" />
</template>
