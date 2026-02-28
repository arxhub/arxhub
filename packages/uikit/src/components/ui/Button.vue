<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon'
  size?: 'sm' | 'md' | 'icon'
  active?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button 
    class="btn" 
    :class="[`btn-${variant || 'primary'}`, `btn-${size || 'md'}`, { active }]"
    :type="type || 'button'"
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
  gap: 0.375rem;
}

/* Variants */
.btn-primary {
  background-color: var(--accent-9);
  color: white;
}
.btn-primary:hover {
  background-color: var(--accent-10);
}

.btn-secondary {
  background-color: var(--gray-3);
  border-color: var(--gray-6);
  color: var(--gray-12);
}
.btn-secondary:hover {
  background-color: var(--gray-6);
}

.btn-ghost {
  background-color: transparent;
  border-color: var(--accent-a5);
  color: var(--accent-9);
}
.btn-ghost:hover {
  background-color: var(--accent-a3);
}

.btn-icon {
  background-color: transparent;
  color: var(--gray-11);
}
.btn-icon:hover {
  background-color: var(--gray-3);
  color: var(--gray-12);
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

.btn-icon {
  width: var(--size-xs);
  height: var(--size-xs);
  padding: 0;
}
</style>
