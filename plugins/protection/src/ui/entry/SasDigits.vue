<script setup lang="ts">
import { formatPairingSas } from '@arxhub/crypto'
import { computed } from 'vue'

// The six digits both screens must show, in two groups of three — the shape a person reads aloud and
// compares at a glance.
const props = defineProps<{ sas: string }>()
const text = computed(() => formatPairingSas(props.sas))
</script>

<template>
  <p class="sas" data-testid="pairing-sas" :aria-label="sas.split('').join(' ')">{{ text }}</p>
</template>

<style scoped>
.sas {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-2xl);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.12em;
  color: var(--gray-12);
  text-align: center;
}
</style>
