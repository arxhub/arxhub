<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { ScrollArea } from '@arxhub/uikit/core'
</script>

<template>
  <!-- This remains outside the app landmark for the same reason as the desktop gate. The inner flex
       item uses auto block margins: it centres on a tall phone and falls back to the safe top edge
       when the keypad and recovery copy are taller than a short viewport. -->
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

/* ScrollArea's content is already at least the viewport's height, which is what min-height: 100% did. */
.gate-scroll :deep(.gate-inner) {
  display: flex;
  padding: max(var(--size-xs-half), env(safe-area-inset-top)) max(var(--size-xs-half), env(safe-area-inset-right))
    max(var(--size-xs-half), env(safe-area-inset-bottom)) max(var(--size-xs-half), env(safe-area-inset-left));
}

.card {
  --unlock-copy-align: center;
  --unlock-action-direction: row;
  --unlock-action-align: stretch;
  --unlock-action-width: 100%;
  --unlock-action-flex: 1;
  --unlock-recovery-align: center;

  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 360px;
  margin: auto;
}

.intro,
.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intro {
  align-items: center;
}

.intro :deep(.title) {
  font-size: var(--font-size-2xl);
}

.content,
.actions,
.recovery {
  width: 100%;
}
</style>
