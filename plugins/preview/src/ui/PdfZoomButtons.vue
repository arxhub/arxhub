<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'
import { MAX_ZOOM, MIN_ZOOM } from '../pdf'

defineProps<{
  zoom: number
  onZoomOut: () => void
  onZoomIn: () => void
}>()
</script>

<template>
  <IconButton size="xl" icon="lu:zoom-out" tooltip="Zoom out" :disabled="zoom <= MIN_ZOOM" @click="onZoomOut()" />
  <IconButton size="xl" icon="lu:zoom-in" tooltip="Zoom in" :disabled="zoom >= MAX_ZOOM" @click="onZoomIn()" />
</template>
