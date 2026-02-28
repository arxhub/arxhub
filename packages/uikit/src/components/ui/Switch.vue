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
  opacity: 0.5;
  cursor: not-allowed;
}

.control {
  width: var(--size-xs);
  height: var(--size-xs-half);
  background-color: var(--gray-3);
  border-radius: var(--radius-full);
  position: relative;
  transition: background-color var(--duration-normal);
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.control[data-state='checked'] {
  background-color: var(--accent-9);
}

.control[data-focus-visible] {
  outline: 2px solid var(--accent-9);
  outline-offset: 2px;
}

.thumb {
  width: 0.75rem;
  height: 0.75rem;
  background-color: white;
  border-radius: var(--radius-full);
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  transition: transform var(--duration-normal);
}

.control[data-state='checked'] .thumb {
  transform: translateX(1rem);
}

.label {
  font-size: var(--font-size-xs);
  color: var(--gray-12);
  font-family: var(--font-sans);
  cursor: pointer;
}
</style>
