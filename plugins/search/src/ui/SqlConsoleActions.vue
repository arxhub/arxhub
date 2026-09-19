<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopSqlConsoleActions from './DesktopSqlConsoleActions.vue'
import MobileSqlConsoleActions from './MobileSqlConsoleActions.vue'

defineProps<{
  canRun: boolean
  running: boolean
  schemaOpen: boolean
  onRun: () => void
  onExample: () => void
  onToggleSchema: () => void
}>()

const impl = useShellFrame() === 'mobile' ? MobileSqlConsoleActions : DesktopSqlConsoleActions
</script>

<template>
  <component
    :is="impl"
    :can-run="canRun"
    :running="running"
    :schema-open="schemaOpen"
    :on-run="onRun"
    :on-example="onExample"
    :on-toggle-schema="onToggleSchema"
  />
</template>
