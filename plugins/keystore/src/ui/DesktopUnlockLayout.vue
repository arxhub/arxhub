<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { ScrollArea } from '@arxhub/uikit/core'
</script>

<template>
  <!-- Deliberately not <main>: the app's own main landmark is what tells the rest of the suite (and
       a screen reader) that the app itself has come up, and the gate must not answer to that. -->
  <div class="gate">
    <ScrollArea class="gate-scroll" content-class="gate-inner">
      <div class="card">
        <header class="intro">
          <slot name="title" />
          <slot name="help" />
        </header>
        <div class="content"><slot /></div>
        <div class="actions"><slot name="actions" /></div>
        <div v-if="$slots.recovery" class="recovery"><slot name="recovery" /></div>
      </div>
    </ScrollArea>
  </div>
</template>

<style scoped>
.gate {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background-color: var(--gray-1);
  font-family: var(--font-sans);
}

/* Ark puts `position: relative` inline on the ScrollArea root, which would beat a fixed overlay on it. */
.gate-scroll {
  width: 100%;
  height: 100%;
}

.gate-scroll :deep(.gate-inner) {
  display: grid;
  place-items: center;
  padding: 16px;
}

.card,
.intro,
.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intro :deep(.title) {
  font-size: var(--font-size-lg);
}

.card {
  width: 100%;
  max-width: 320px;
}
</style>
