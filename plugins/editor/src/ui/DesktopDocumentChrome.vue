<script setup lang="ts">
defineProps<{ target: HTMLElement | null; status: string; mode: string }>()
</script>
<template>
  <div class="document-tools-fallback">
    <Teleport :to="target ?? 'body'" :disabled="!target"><slot /></Teleport>
    <span class="save-announcement document-save-status" role="status" aria-live="polite">{{ status }}</span>
  </div>
</template>
<style scoped>
.document-tools-fallback { position: absolute; top: 8px; right: 8px; }
.save-announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
