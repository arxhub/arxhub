<script setup lang="ts">
import { type ActionItem, ActionMenuButton, Button } from '@arxhub/uikit/core'

const props = defineProps<{
  canRun: boolean
  running: boolean
  schemaOpen: boolean
  onRun: () => void
  onExample: () => void
  onToggleSchema: () => void
}>()

function items(): ActionItem[] {
  return [
    { id: 'example', label: 'Example', icon: 'lu:sparkles', onSelect: props.onExample },
    {
      id: 'schema',
      label: props.schemaOpen ? 'Hide schema' : 'Show schema',
      icon: 'lu:table',
      onSelect: props.onToggleSchema,
    },
  ]
}
</script>

<template>
  <!-- Run is the commit; Example/Schema are occasional — behind More on a narrow strip. -->
  <Button size="lg" :disabled="!canRun" @click="onRun()">{{ running ? 'Running…' : 'Run' }}</Button>
  <ActionMenuButton label="More console actions" title="SQL console" :items="items" />
</template>
