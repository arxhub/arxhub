<script setup lang="ts">
import { Button } from '@arxhub/uikit/core'

// The phone's realization of the editor's frame: the text and, when it could not be read, why. Its name,
// its tools and its editing toolbar are the object band's, described through `registerViewBar` — a band
// of its own here was the second bottom bar the phone's frame replaced, and a name strip at the top was a
// control out of the thumb's reach.
// The dispatcher hands both realizations the same props; the ones only the desktop draws must not land
// on this element as attributes.
defineOptions({ inheritAttrs: false })
defineProps<{ loadError: unknown; onSave: () => void; onRetry: () => void }>()
</script>

<template>
  <div class="codemirror-wrapper" @keydown.ctrl.s.prevent.stop="onSave()" @keydown.meta.s.prevent.stop="onSave()">
    <div v-if="loadError" class="codemirror-error">
      <span>Couldn't load this file. Saving is disabled to avoid overwriting it.</span>
      <Button size="lg" variant="secondary" @click="onRetry()">Retry</Button>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.codemirror-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.codemirror-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: var(--font-size-xs);
  color: var(--danger-11);
  background: var(--danger-2);
  border-bottom: 1px solid var(--danger-6);
}
</style>
