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
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  transition: all var(--duration-normal);
  cursor: pointer;
  border: 1px solid transparent;
  gap: 0.5rem;
}

.btn:focus-visible {
  outline: 2px solid var(--accent-9);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.5;
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
  background-color: var(--gray-3);
  border-color: var(--gray-6);
  color: var(--gray-12);
}
.btn-secondary:hover:not(:disabled) {
  background-color: var(--gray-4);
}

.btn-ghost {
  background-color: transparent;
  border-color: var(--accent-a5);
  color: var(--accent-9);
}
.btn-ghost:hover:not(:disabled) {
  background-color: var(--accent-a3);
}

.btn-danger {
  background-color: var(--danger-9);
  color: var(--danger-contrast);
}
.btn-danger:hover:not(:disabled) {
  background-color: var(--danger-10);
}

/* Sizes */
.btn-sm {
  height: 1.5rem;
  padding: 0 0.5rem;
}

.btn-md {
  height: var(--size-sm);
  padding: 0 1rem;
}
</style>
