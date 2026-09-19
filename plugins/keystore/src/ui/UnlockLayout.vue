<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopUnlockLayout from './DesktopUnlockLayout.vue'
import MobileUnlockLayout from './MobileUnlockLayout.vue'

const layout = useShellFrame() === 'mobile' ? MobileUnlockLayout : DesktopUnlockLayout
</script>

<template>
  <component :is="layout">
    <template #title><slot name="title" /></template>
    <template #help><slot name="help" /></template>
    <slot />
    <template #actions><slot name="actions" /></template>
    <template v-if="$slots.recovery" #recovery><slot name="recovery" /></template>
  </component>
</template>
