<script setup lang="ts">
import { Button } from '@arxhub/uikit/core'

defineProps<{
  canRun: boolean
  running: boolean
  schemaOpen: boolean
  onRun: () => void
  onExample: () => void
  onToggleSchema: () => void
}>()
</script>

<template>
  <Button size="sm" :disabled="!canRun" @click="onRun()">{{ running ? 'Running…' : 'Run' }}</Button>
  <Button size="sm" variant="secondary" @click="onExample()">Example</Button>
  <Button size="sm" variant="secondary" :active="schemaOpen" :aria-pressed="schemaOpen" @click="onToggleSchema()">Schema</Button>
</template>
