<script setup lang="ts">
import { actionMenu, IconButton } from '@arxhub/uikit/core'

const props = defineProps<{
  busy: boolean
  onCopy: () => void
  onOpen: () => void
  onRepublish: () => void
  onUnpublish: () => void
}>()

function more(event: MouseEvent): void {
  actionMenu.open(
    [
      { id: 'open', label: 'Open in browser', icon: 'lu:external-link', disabled: props.busy, onSelect: props.onOpen },
      { id: 'republish', label: 'Republish', icon: 'lu:globe', disabled: props.busy, onSelect: props.onRepublish },
      { id: 'unpublish', label: 'Unpublish', icon: 'lu:eye-off', disabled: props.busy, onSelect: props.onUnpublish },
    ],
    { x: event.clientX, y: event.clientY, title: 'Publication' },
  )
}
</script>

<template>
  <!-- Frequent: Copy link. Occasional: behind More — four lg icons do not fit a 360 row. -->
  <IconButton size="lg" icon="lu:link" tooltip="Copy link" :disabled="busy" @click="onCopy()" />
  <IconButton size="lg" icon="lu:ellipsis" tooltip="More publication actions" ariaLabel="More publication actions" :disabled="busy" @click="more" />
</template>
