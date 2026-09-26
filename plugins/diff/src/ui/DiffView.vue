<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DiffViewDesktop from './DiffViewDesktop.vue'
import DiffViewMobile from './DiffViewMobile.vue'
import type { DiffViewProps } from './types'

defineProps<DiffViewProps>()
const realization = useShellFrame() === 'mobile' ? DiffViewMobile : DiffViewDesktop
</script>

<template>
  <component :is="realization" v-bind="$props" />
</template>
