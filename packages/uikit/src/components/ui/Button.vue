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
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 0.75rem; /* text-xs */
  transition: all 0.2s;
  cursor: pointer;
  border: 1px solid transparent;
  gap: 0.375rem;
}

/* Variants */
.btn-primary {
  background-color: var(--primary);
  color: white;
}
.btn-primary:hover {
  background-color: var(--radix-cyan-10);
}

.btn-secondary {
  background-color: var(--radix-gray-3);
  border-color: var(--border-cold);
  color: var(--text-main);
}
.btn-secondary:hover {
  background-color: var(--radix-gray-6);
}

.btn-ghost {
  background-color: transparent;
  border-color: rgba(53, 158, 255, 0.3); /* primary/30 */
  color: var(--primary);
}
.btn-ghost:hover {
  background-color: rgba(53, 158, 255, 0.1); /* primary/10 */
}

.btn-icon {
  background-color: transparent;
  color: var(--text-muted);
}
.btn-icon:hover {
  background-color: var(--radix-gray-3);
  color: var(--text-main);
}

/* Sizes */
.btn-sm {
  height: 1.5rem; /* h-6 */
  padding: 0 0.5rem;
}

.btn-md {
  height: 2.25rem; /* h-9 */
  padding: 0 1rem;
}

.btn-icon {
  width: 2rem; /* size-8 */
  height: 2rem;
  padding: 0;
}
</style>
