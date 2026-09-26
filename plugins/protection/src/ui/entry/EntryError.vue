<script setup lang="ts">
import type { EntryFlow } from '../../entry/entry-flow'

// A step that failed on the way to the next screen — a store that refused a write — said where the
// person is looking rather than lost in the log.
defineProps<{ flow: EntryFlow }>()
</script>

<template>
  <p v-if="flow.error.value" class="entry-error" role="alert">{{ flow.error.value }}</p>
</template>

<style scoped>
.entry-error {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--danger-11);
}
</style>
