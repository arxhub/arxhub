<script setup lang="ts">
import { actionMenu, Button, IconButton } from '@arxhub/uikit/core'

const props = defineProps<{
  canRun: boolean
  running: boolean
  schemaOpen: boolean
  onRun: () => void
  onExample: () => void
  onToggleSchema: () => void
}>()

function more(event: MouseEvent): void {
  actionMenu.open(
    [
      { id: 'example', label: 'Example', icon: 'lu:sparkles', onSelect: props.onExample },
      {
        id: 'schema',
        label: props.schemaOpen ? 'Hide schema' : 'Show schema',
        icon: 'lu:table',
        onSelect: props.onToggleSchema,
      },
    ],
    { x: event.clientX, y: event.clientY, title: 'SQL console' },
  )
}
</script>

<template>
  <!-- Run is the commit; Example/Schema are occasional — behind More on a narrow strip. -->
  <Button size="lg" :disabled="!canRun" @click="onRun()">{{ running ? 'Running…' : 'Run' }}</Button>
  <IconButton size="lg" icon="lu:ellipsis" tooltip="More console actions" ariaLabel="More console actions" @click="more" />
</template>
