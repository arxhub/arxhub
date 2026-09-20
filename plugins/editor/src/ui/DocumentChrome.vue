<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopDocumentChrome from './DesktopDocumentChrome.vue'
import MobileDocumentChrome from './MobileDocumentChrome.vue'

defineProps<{ target: HTMLElement | null; status: string; mode: string }>()
const surface = useShellFrame() === 'mobile' ? MobileDocumentChrome : DesktopDocumentChrome
</script>
<template><component :is="surface" v-bind="$props"><slot /></component></template>
