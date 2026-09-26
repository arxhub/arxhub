<script setup lang="ts">
import { computed } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  /** Fills the width of its container — the confirm action at the foot of a sheet. */
  block?: boolean
  /** `start` reads its label from the leading edge and lets it shrink — a button that names a place (the
   * open object in the phone's band) rather than an action, whose name can be longer than its room. */
  align?: 'center' | 'start'
}>()

// Like Row, the frame decides the default height: a control on the phone is a touch target (48px). An
// explicit size still wins, for the few places whose band dictates a smaller one.
const touch = useShellFrame() === 'mobile'
const resolvedSize = computed(() => props.size ?? (touch ? 'lg' : 'md'))
</script>

<template>
  <button
    class="btn"
    :class="[`btn-${variant || 'primary'}`, `btn-${resolvedSize}`, { active, block, start: align === 'start' }]"
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

.btn.start {
  justify-content: flex-start;
  min-width: 0;
  overflow: hidden;
  text-align: start;
}

.btn.block {
  display: flex;
  width: 100%;
  min-width: 0;
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
  height: var(--size-xl-half);
  padding: 0 8px;
  font-size: var(--font-size-sm);
}

.btn-md {
  height: var(--size-xs);
  padding: 0 12px;
  font-size: var(--font-size-sm);
}

.btn-lg {
  height: var(--size-xl);
  padding: 0 16px;
  font-size: var(--font-size-md);
}
</style>
