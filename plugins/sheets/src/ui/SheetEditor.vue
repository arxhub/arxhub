<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import { provide } from 'vue'
import SheetDesktop from './SheetDesktop.vue'
import SheetMobile from './SheetMobile.vue'
import SheetTools from './SheetTools.vue'
import { createSheetSession, sheetSessionKey } from './use-sheet'

const props = defineProps<{ path: string }>()
provide(sheetSessionKey, createSheetSession(props))
const frame = useShellFrame() === 'mobile' ? SheetMobile : SheetDesktop
</script>

<template><component :is="frame" /><SheetTools /></template>
