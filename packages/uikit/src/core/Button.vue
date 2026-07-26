<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  active?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button
    class="btn"
    :class="[`btn-${variant || 'primary'}`, `btn-${size || 'md'}`, { active }]"
    :type="type || 'button'"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  font-family: var(--font-sans);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-none);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--duration-fast), border-color var(--duration-fast), color var(--duration-fast);
}

.btn:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}

/* One disabled treatment for every variant: an unavailable control goes flat and inert rather than
   keeping a faded version of the colour it would have had, so "can't press this" never reads as
   "primary action, dimmed". */
.btn:disabled {
  background-color: var(--gray-3);
  border-color: transparent;
  color: var(--gray-9);
  cursor: not-allowed;
}

/* Variants */
.btn-primary {
  background-color: var(--accent-9);
  color: var(--accent-contrast);
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--accent-10);
}

.btn-secondary {
  background-color: var(--gray-1);
  border-color: var(--gray-7);
  color: var(--gray-12);
}
.btn-secondary:hover:not(:disabled) {
  background-color: var(--gray-3);
}

.btn-ghost {
  background-color: transparent;
  color: var(--gray-11);
}
.btn-ghost:hover:not(:disabled) {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

/* Destructive actions are outlined rather than filled: the solid accent stays reserved for the
   primary path, and red only has to say which of the buttons on offer is the dangerous one. */
.btn-danger {
  background-color: var(--gray-1);
  border-color: var(--danger-7);
  color: var(--danger-11);
}
.btn-danger:hover:not(:disabled) {
  background-color: var(--danger-3);
  border-color: var(--danger-8);
}

.btn-ghost.active:not(:disabled),
.btn-secondary.active:not(:disabled) {
  background-color: var(--accent-3);
  border-color: var(--accent-6);
  color: var(--accent-11);
}

/* Sizes */
.btn-sm {
  height: 24px;
  padding: 0 8px;
  font-size: var(--font-size-xs);
}

.btn-md {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
}
</style>
