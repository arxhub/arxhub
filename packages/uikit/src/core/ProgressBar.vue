<script setup lang="ts">
import { Progress } from '@ark-ui/vue'

withDefaults(
  defineProps<{
    value: number
    max?: number
  }>(),
  { max: 100 },
)
</script>

<template>
  <Progress.Root class="root" :value="value" :max="max ?? 100">
    <Progress.Track class="track">
      <Progress.Range class="range" />
    </Progress.Track>
  </Progress.Root>
</template>

<style scoped>
.track {
  width: 100%;
  height: 4px;
  background-color: var(--gray-4);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.range {
  height: 100%;
  background-color: var(--accent-9);
  border-radius: var(--radius-full);
  width: var(--percent);
  transition: width var(--duration-slow) ease;
}

@media (prefers-reduced-motion: reduce) {
  .range { transition: none; }
}
</style>
