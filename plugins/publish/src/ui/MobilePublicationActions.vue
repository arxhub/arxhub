<script setup lang="ts">
import { type ActionItem, ActionMenuButton, IconButton } from '@arxhub/uikit/core'

const props = defineProps<{
  busy: boolean
  onCopy: () => void
  onOpen: () => void
  onRepublish: () => void
  onUnpublish: () => void
}>()

function items(): ActionItem[] {
  return [
    { id: 'open', label: 'Open in browser', icon: 'lu:external-link', disabled: props.busy, onSelect: props.onOpen },
    { id: 'republish', label: 'Republish', icon: 'lu:globe', disabled: props.busy, onSelect: props.onRepublish },
    { id: 'unpublish', label: 'Unpublish', icon: 'lu:eye-off', disabled: props.busy, onSelect: props.onUnpublish },
  ]
}
</script>

<template>
  <!-- Frequent: Copy link. Occasional: behind More — four lg icons do not fit a 360 row. -->
  <IconButton size="xl" icon="lu:link" tooltip="Copy link" :disabled="busy" @click="onCopy()" />
  <ActionMenuButton label="More publication actions" title="Publication" :items="items" :disabled="busy" />
</template>
