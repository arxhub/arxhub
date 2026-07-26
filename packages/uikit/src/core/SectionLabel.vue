<script setup lang="ts">
defineProps<{ tone?: 'muted' | 'danger' }>()
</script>

<template>
  <div class="section-label" :class="tone ?? 'muted'">
    <slot />
  </div>
</template>

<style scoped>
.section-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-none);
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.muted { color: var(--gray-10); }
.danger { color: var(--danger-10); }
</style>
