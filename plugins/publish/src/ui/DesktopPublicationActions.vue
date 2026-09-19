<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'

defineProps<{
  busy: boolean
  onCopy: () => void
  onOpen: () => void
  onRepublish: () => void
  onUnpublish: () => void
}>()
</script>

<template>
  <!-- Desktop rows are 28px — sm fills them; lg would overflow the row. -->
  <IconButton icon="lu:link" size="sm" tooltip="Copy link" :disabled="busy" @click="onCopy()" />
  <IconButton icon="lu:external-link" size="sm" tooltip="Open in browser" :disabled="busy" @click="onOpen()" />
  <IconButton icon="lu:globe" size="sm" tooltip="Republish" :disabled="busy" @click="onRepublish()" />
  <IconButton icon="lu:eye-off" size="sm" tooltip="Unpublish" :disabled="busy" @click="onUnpublish()" />
</template>
