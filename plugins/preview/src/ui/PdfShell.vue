<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopPdfShell from './DesktopPdfShell.vue'
import MobilePdfShell from './MobilePdfShell.vue'

defineProps<{
  path: string
  meta: string
  zoom: number
  onZoom: (value: number) => void
  page: number
  pageCount: number
  onPage: (index: number) => void
}>()

const mobile = useShellFrame() === 'mobile'
</script>

<template>
  <MobilePdfShell v-if="mobile" :path="path" :meta="meta" :zoom="zoom" :on-zoom="onZoom" :page="page" :page-count="pageCount" :on-page="onPage">
    <slot />
  </MobilePdfShell>
  <DesktopPdfShell v-else :path="path" :meta="meta" :zoom="zoom" :on-zoom="onZoom">
    <slot />
  </DesktopPdfShell>
</template>
