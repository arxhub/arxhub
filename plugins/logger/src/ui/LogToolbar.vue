<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopLogToolbar from './DesktopLogToolbar.vue'
import MobileLogToolbar from './MobileLogToolbar.vue'

const Toolbar = useShellFrame() === 'mobile' ? MobileLogToolbar : DesktopLogToolbar
</script>

<template>
  <component :is="Toolbar">
    <template #levels><slot name="levels" /></template>
    <template #actions><slot name="actions" /></template>
    <template #search><slot name="search" /></template>
    <template #session><slot name="session" /></template>
  </component>
</template>
