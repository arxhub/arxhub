<script setup lang="ts">
import type { InlineSegment } from '../model'

defineProps<{ segments: readonly InlineSegment[] }>()
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index"><del v-if="segment.kind === 'removed'">{{ segment.text }}</del><ins v-else-if="segment.kind === 'added'">{{ segment.text }}</ins><template v-else>{{ segment.text }}</template></template>
</template>

<style scoped>
/* clone: a phrase that wraps keeps its fill and its rounded ends on every line, not one ragged box. */
del,
ins {
  padding: 0 4px;
  border-radius: var(--radius-xs);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

del {
  background: var(--danger-4);
  color: var(--danger-12);
  text-decoration: line-through;
}

ins {
  background: var(--success-4);
  color: var(--success-12);
  text-decoration: none;
}

/* The word differ rebuilds each side's text exactly, so it never invents the space between a replaced word and
   its replacement — the view draws that gap instead. */
del + ins {
  margin-left: 4px;
}
</style>
