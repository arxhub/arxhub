<script setup lang="ts">
const model = defineModel<string>()

defineProps<{
  placeholder?: string
  type?: string
  disabled?: boolean
}>()
</script>

<template>
  <input
    class="input"
    :type="type || 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    v-model="model"
  />
</template>

<style scoped>
.input {
  width: 100%;
  height: 32px;
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

/* A single focus ring shared with every other control — no border tint stacked under an outline. */
.input:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
  border-color: var(--accent-8);
}

.input::placeholder {
  color: var(--gray-10);
}

.input:disabled {
  background-color: var(--gray-2);
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
