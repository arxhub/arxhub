<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import DesktopInspectorPanel from './DesktopInspectorPanel.vue'
import MobileInspectorPanel from './MobileInspectorPanel.vue'

defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ close: [] }>()
const surface = useShellFrame() === 'mobile' ? MobileInspectorPanel : DesktopInspectorPanel
</script>
<template><component :is="surface" :title="title" :subtitle="subtitle" @close="emit('close')"><slot /></component></template>
