<script setup lang="ts">
defineProps<{
  modelValue?: boolean
  label?: string
}>()

defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
</script>

<template>
  <button 
    class="switch" 
    :class="{ checked: modelValue }"
    @click="$emit('update:modelValue', !modelValue)"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label || 'Toggle switch'"
    type="button"
  >
    <div class="thumb"></div>
  </button>
</template>

<style scoped>
.switch {
  width: 2rem; /* w-8 */
  height: 1rem; /* h-4 */
  background-color: var(--radix-gray-3);
  border-radius: 9999px;
  position: relative;
  cursor: pointer;
  transition: background-color 0.2s;
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.switch:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.switch.checked {
  background-color: var(--primary);
}

.thumb {
  width: 0.75rem; /* size-3 */
  height: 0.75rem;
  background-color: white;
  border-radius: 50%;
  position: absolute;
  top: 0.125rem; /* top-0.5 */
  left: 0.125rem;
  transition: transform 0.2s;
}

.switch.checked .thumb {
  transform: translateX(1rem);
}
</style>
