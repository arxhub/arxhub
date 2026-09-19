<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DocumentFindDesktop from './DocumentFindDesktop.vue'
import DocumentFindMobile from './DocumentFindMobile.vue'
import type { DocumentFindProps } from './use-document-find'

defineProps<DocumentFindProps>()
const emit = defineEmits<{ close: [] }>()
const view = useShellFrame() === 'mobile' ? DocumentFindMobile : DocumentFindDesktop
</script>

<template><component :is="view" v-bind="$props" @close="emit('close')" /></template>
