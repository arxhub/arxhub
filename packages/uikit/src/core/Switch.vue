<script setup lang="ts">
import { Switch } from '@ark-ui/vue'

defineProps<{
  modelValue?: boolean
  label?: string
  disabled?: boolean
}>()

defineEmits<(e: 'update:modelValue', value: boolean) => void>()
</script>

<template>
  <Switch.Root
    class="root"
    :checked="modelValue"
    :disabled="disabled"
    @checked-change="$emit('update:modelValue', $event.checked)"
  >
    <Switch.Control class="control">
      <Switch.Thumb class="thumb" />
    </Switch.Control>
    <Switch.Label v-if="label" class="label">{{ label }}</Switch.Label>
    <Switch.HiddenInput />
  </Switch.Root>
</template>

<style scoped>
.root {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.root[data-disabled] {
  cursor: not-allowed;
}

.root[data-disabled] .label {
  color: var(--gray-9);
}

.control {
  width: var(--size-xs);
  height: var(--size-xs-half);
  background-color: var(--gray-6);
  border-radius: var(--radius-full);
  position: relative;
  transition: background-color var(--duration-fast);
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.control[data-state='checked'] {
  background-color: var(--accent-9);
}

.control[data-disabled] {
  background-color: var(--gray-4);
}

.control[data-focus-visible] {
  outline: 2px solid var(--accent-8);
  outline-offset: 2px;
}

.thumb {
  width: 0.75rem;
  height: 0.75rem;
  background-color: var(--white);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-xs);
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  transition: transform var(--duration-fast);
}

.control[data-state='checked'] .thumb {
  transform: translateX(1rem);
}

@media (prefers-reduced-motion: reduce) {
  .thumb { transition: none; }
}

.label {
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  font-family: var(--font-sans);
  cursor: pointer;
}
</style>
