<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'

const model = defineModel<string>()

defineProps<{
  placeholder?: string
  type?: string
  disabled?: boolean
}>()

const touch = useShellFrame() === 'mobile'
</script>

<template>
  <input
    class="input"
    :class="{ touch }"
    :type="type || 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    v-model="model"
  />
</template>

<style scoped>
.input {
  width: 100%;
  height: var(--size-xs);
  background-color: var(--gray-1);
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  padding: 0 12px;
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  outline: none;
  font-family: var(--font-sans);
  transition: border-color var(--duration-fast), background-color var(--duration-fast);
}

.input.touch {
  height: var(--size-md);
}

/* A single focus ring shared with every other control — no border tint stacked under an outline. */
.input:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
  border-color: var(--accent-8);
}

.input:disabled {
  background-color: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
