<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DocumentVersionsDesktop from './DocumentVersionsDesktop.vue'
import DocumentVersionsMobile from './DocumentVersionsMobile.vue'
import type { DocumentVersionsProps } from './use-document-versions'

defineProps<DocumentVersionsProps>()
defineEmits<{ close: [] }>()
const surface = useShellFrame() === 'mobile' ? DocumentVersionsMobile : DocumentVersionsDesktop
</script>

<template><component :is="surface" v-bind="$props" @close="$emit('close')" /></template>
