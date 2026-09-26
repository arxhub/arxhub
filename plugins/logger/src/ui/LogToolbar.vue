<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopLogToolbar from './DesktopLogToolbar.vue'

// Only the desktop draws the filter above the log. The phone keeps nothing pressable at the top of the screen:
// its levels, sessions and filter text are in the type's second-tap sheet, and its commands in the band.
const desktop = useShellFrame() !== 'mobile'
</script>

<template>
  <DesktopLogToolbar v-if="desktop">
    <template #levels><slot name="levels" /></template>
    <template #actions><slot name="actions" /></template>
    <template #search><slot name="search" /></template>
    <template #session><slot name="session" /></template>
  </DesktopLogToolbar>
</template>
