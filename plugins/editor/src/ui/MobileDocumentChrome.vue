<script setup lang="ts">
defineProps<{ status: string; mode: string }>()
</script>
<template>
  <div class="editor-status"><slot /><span class="document-save-status" role="status" aria-live="polite">{{ status }}</span>
    <span v-if="mode !== 'editable'">{{ mode === 'readonly' ? 'Read only' : 'Interactive' }}</span>
  </div>
</template>
<style scoped>
.editor-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; flex-shrink: 0; min-height: var(--size-xl); padding: 4px 12px; color: var(--gray-11); font-size: var(--font-size-xs); border-top: 1px solid var(--gray-6); background: var(--gray-2); }
</style>
