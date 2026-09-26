<script setup lang="ts">
import type { BlockAnchor } from '@arxhub/plugin-documents'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { provide } from 'vue'
import SheetDesktop from './SheetDesktop.vue'
import SheetMobile from './SheetMobile.vue'
import SheetTools from './SheetTools.vue'
import { createSheetSession, sheetSessionKey } from './use-sheet'

const props = defineProps<{ path: string; anchor?: BlockAnchor }>()
provide(sheetSessionKey, createSheetSession(props))
const frame = useShellFrame() === 'mobile' ? SheetMobile : SheetDesktop
</script>

<template><component :is="frame" :path="path" /><SheetTools /></template>
