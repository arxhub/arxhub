<script setup lang="ts">
const model = defineModel<string>()

defineProps<{
  placeholder?: string
  type?: string
}>()
</script>

<template>
  <input
    class="input"
    :type="type || 'text'"
    :placeholder="placeholder"
    v-model="model"
  />
</template>

<style scoped>
.input {
  width: 100%;
  height: 2.25rem; /* h-9 */
  background-color: var(--radix-gray-1);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 0 0.75rem; /* px-3 */
  font-size: 0.75rem; /* text-xs */
  color: white;
  outline: none;
  font-family: var(--font-display);
  transition: all 0.2s;
}

.input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px rgba(53, 158, 255, 0.2); /* ring-1 ring-primary/20 */
}

.input::placeholder {
  color: var(--text-muted);
}
</style>
