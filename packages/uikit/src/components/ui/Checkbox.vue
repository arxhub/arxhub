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
  <label class="checkbox-wrapper">
    <input 
      type="checkbox" 
      class="sr-only"
      :checked="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <div 
      class="checkbox" 
      :class="{ checked: modelValue }"
      aria-hidden="true"
    >
      <span v-if="modelValue" class="material-symbols-outlined check-icon">check</span>
    </div>
    <span v-if="label" class="label-text">{{ label }}</span>
  </label>
</template>

<style scoped>
.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem; /* gap-3 */
  cursor: pointer;
  user-select: none;
  position: relative;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.checkbox {
  width: 1rem; /* size-4 */
  height: 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--primary);
  background-color: rgba(53, 158, 255, 0.2); /* primary/20 */
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  transition: all 0.2s;
}

.checkbox-wrapper:focus-within .checkbox {
  box-shadow: 0 0 0 2px var(--bg-app), 0 0 0 4px var(--primary);
}

.checkbox.checked {
  background-color: rgba(53, 158, 255, 0.2);
}

.check-icon {
  font-size: 12px;
  font-weight: bold;
}

.label-text {
  font-size: 0.75rem; /* text-xs */
  color: var(--text-main);
  font-family: var(--font-display);
}
</style>
