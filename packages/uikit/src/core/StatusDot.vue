<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
    pulse?: boolean
  }>(),
  { tone: 'neutral', pulse: false },
)
</script>

<template>
  <span class="status-dot" :class="[tone, { pulse }]" aria-hidden="true" />
</template>

<style scoped>
.status-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background: var(--gray-8);
}

.accent { background: var(--accent-9); }
.success { background: var(--success-9); }
.warning { background: var(--warning-9); }
.danger { background: var(--danger-9); }

.pulse {
  animation: status-dot-pulse 1s infinite;
}

@keyframes status-dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@media (prefers-reduced-motion: reduce) {
  .pulse { animation: none; }
}
</style>
