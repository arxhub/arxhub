<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopPdfShell from './DesktopPdfShell.vue'
import MobilePdfShell from './MobilePdfShell.vue'

defineProps<{
  path: string
  meta: string
  zoom: number
  onZoom: (value: number) => void
}>()

const impl = useShellFrame() === 'mobile' ? MobilePdfShell : DesktopPdfShell
</script>

<template>
  <component :is="impl" :path="path" :meta="meta" :zoom="zoom" :on-zoom="onZoom">
    <slot />
  </component>
</template>
