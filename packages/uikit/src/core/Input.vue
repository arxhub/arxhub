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
  height: var(--size-sm);
  background-color: var(--gray-1);
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  padding: 0 0.75rem;
  font-size: var(--font-size-xs);
  color: var(--gray-12);
  outline: none;
  font-family: var(--font-sans);
  transition: all var(--duration-normal);
}

.input:focus {
  border-color: var(--accent-9);
  box-shadow: 0 0 0 1px var(--accent-a2);
}

.input::placeholder {
  color: var(--gray-11);
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
