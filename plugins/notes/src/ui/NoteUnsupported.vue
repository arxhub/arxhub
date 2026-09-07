<script setup lang="ts">
defineProps<{ path: string }>()
</script>

<template>
  <!-- The file was found, there is nothing to open it with. That is an answer, not a refusal: the tab
       exists, and it says what is missing. -->
  <div class="note-unsupported">
    <p class="headline">Nothing can open this file</p>
    <p class="path">{{ path }}</p>
    <p class="hint">No installed viewer claims this extension.</p>
  </div>
</template>

<style scoped>
.note-unsupported {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  font-family: var(--font-sans);
  text-align: center;
}

.headline {
  margin: 0;
  color: var(--gray-12);
  font-size: var(--font-size-md);
}

.path {
  margin: 0;
  color: var(--gray-11);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.hint {
  margin: 0;
  color: var(--gray-10);
  font-size: var(--font-size-sm);
}
</style>
