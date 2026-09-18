<script setup lang="ts">
import { Switch } from '@ark-ui/vue'
import { useShellFrame } from '../hooks/useShellFrame'

defineProps<{
  modelValue?: boolean
  label?: string
  disabled?: boolean
}>()

defineEmits<(e: 'update:modelValue', value: boolean) => void>()
const touch = useShellFrame() === 'mobile'
</script>

<template>
  <Switch.Root
    class="root"
    :class="{ touch }"
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
  gap: 8px;
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

/* Phone: a 32×16 track is hard to hit beside a 48px row; grow to --size-md × 24. */
.root.touch .control {
  width: var(--size-md);
  height: var(--size-xl-half);
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
  /* Optical inset inside --size-xs-half (16): 12px thumb leaves 2px, not a grid step. */
  width: 12px;
  height: 12px;
  background-color: var(--white);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-xs);
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform var(--duration-fast);
}

.root.touch .thumb {
  width: var(--size-md-half);
  height: var(--size-md-half);
}

.control[data-state='checked'] .thumb {
  transform: translateX(16px);
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
