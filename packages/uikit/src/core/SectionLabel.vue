<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'

// `inset` is the heading of a group of rows in a list: it stands off the rows above it and lines up with the
// Row's own text inset, so the sheets that group their entries all draw the same break.
defineProps<{ tone?: 'muted' | 'danger'; inset?: boolean }>()
const touch = useShellFrame() === 'mobile'
</script>

<template>
  <div class="section-label" :class="[tone ?? 'muted', { inset, touch }]">
    <slot />
  </div>
</template>

<style scoped>
.section-label {
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-none);
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.muted { color: var(--gray-10); }
.inset { padding: 12px 8px 4px; }
.inset.touch { padding: 12px 16px 4px; }
.inset.muted { color: var(--gray-11); }
.danger { color: var(--danger-10); }
</style>
