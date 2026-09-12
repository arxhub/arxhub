<script setup lang="ts">
import { Input } from '@arxhub/uikit/core'
import type { ArxEditorControlProps } from '../control-views'

defineProps<ArxEditorControlProps>()
</script>

<template>
  <Input v-if="mode === 'editable'" :model-value="node.attrs.title" aria-label="Section title" @update:model-value="change({ title: $event })" />
  <span v-else>{{ node.attrs.title }}</span>
</template>
