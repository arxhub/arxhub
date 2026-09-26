<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopDocumentChrome from './DesktopDocumentChrome.vue'
import DocumentSaveAnnouncement from './DocumentSaveAnnouncement.vue'

defineProps<{ target: HTMLElement | null; status: string; mode: string }>()
const surface = useShellFrame() === 'mobile' ? DocumentSaveAnnouncement : DesktopDocumentChrome
</script>
<template><component :is="surface" v-bind="$props"><slot /></component></template>
