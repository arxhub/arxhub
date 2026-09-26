<script setup lang="ts">
import type { DiffCounts } from '../model'

// '+N −N ~N', zero parts omitted — the strip, the phone's options sheet and anything else that sums a diff read
// it from here, so the colours of the three signs are decided once.
defineProps<{ counts: DiffCounts }>()
</script>

<template>
  <span class="diff-summary">
    <span v-if="counts.added > 0" class="added">+{{ counts.added }}</span>
    <span v-if="counts.removed > 0" class="removed">−{{ counts.removed }}</span>
    <span v-if="counts.changed > 0" class="changed">~{{ counts.changed }}</span>
  </span>
</template>

<style scoped>
.diff-summary {
  display: inline-flex;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.added {
  color: var(--success-12);
}

.removed {
  color: var(--danger-11);
}

.changed {
  color: var(--gray-11);
}
</style>
