<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import DesktopFormattingToolbar from './DesktopFormattingToolbar.vue'
import type { FormattingAction } from './formatting-action'
import MobileFormattingToolbar from './MobileFormattingToolbar.vue'

defineProps<{ actions: FormattingAction[] }>()
const impl = useShellFrame() === 'mobile' ? MobileFormattingToolbar : DesktopFormattingToolbar
</script>

<template>
  <component :is="impl" :actions="actions" />
</template>
