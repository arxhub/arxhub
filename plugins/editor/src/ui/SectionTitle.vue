<script setup lang="ts">
import type { ArxEditorControlProps } from '../control-views'

defineProps<ArxEditorControlProps>()
</script>
<template><span>{{ node.attrs.title }}</span></template>
