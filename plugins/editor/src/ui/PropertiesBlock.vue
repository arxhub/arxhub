<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { ArxEditorControlProps } from '../control-views'
import PropertiesBlockDesktop from './PropertiesBlockDesktop.vue'
import PropertiesBlockMobile from './PropertiesBlockMobile.vue'

defineProps<ArxEditorControlProps>()
const view = useShellFrame() === 'mobile' ? PropertiesBlockMobile : PropertiesBlockDesktop
</script>

<template><component :is="view" v-bind="$props" /></template>
