<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import DesktopGateLayout from './DesktopGateLayout.vue'
import type { GateLayoutProps } from './gate-layout'
import MobileGateLayout from './MobileGateLayout.vue'

defineProps<GateLayoutProps>()
const layout = useShellFrame() === 'mobile' ? MobileGateLayout : DesktopGateLayout
</script>

<template>
  <component :is="layout" :center="center" :anchor="anchor" :width="width" :mark="mark" :bleed="bleed">
    <template v-if="$slots.kicker" #kicker><slot name="kicker" /></template>
    <template v-if="$slots.title" #title><slot name="title" /></template>
    <template v-if="$slots.text" #text><slot name="text" /></template>
    <template v-if="$slots.default" #default><slot /></template>
    <template v-if="$slots.dock" #dock><slot name="dock" /></template>
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    <template v-if="$slots.recovery" #recovery><slot name="recovery" /></template>
  </component>
</template>
