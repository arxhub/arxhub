<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Checkbox } from '@ark-ui/vue'
// biome-ignore lint/correctness/noUnusedImports: used in template
import Icon from './Icon.vue'

defineProps<{
  modelValue?: boolean
  label?: string
  disabled?: boolean
}>()

defineEmits<(e: 'update:modelValue', value: boolean) => void>()
</script>

<template>
  <Checkbox.Root
    class="root"
    :checked="modelValue"
    :disabled="disabled"
    @checked-change="$emit('update:modelValue', $event.checked === true)"
  >
    <Checkbox.Control class="control">
      <Checkbox.Indicator class="indicator">
        <Icon name="lu:check" :size="12" />
      </Checkbox.Indicator>
    </Checkbox.Control>
    <Checkbox.Label v-if="label" class="label">{{ label }}</Checkbox.Label>
    <Checkbox.HiddenInput />
  </Checkbox.Root>
</template>

<style scoped>
.root {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
}

.root[data-disabled] {
  cursor: not-allowed;
}

.root[data-disabled] .label {
  color: var(--gray-9);
}

.control {
  width: var(--size-xs-half);
  height: var(--size-xs-half);
  border-radius: var(--radius-xs);
  border: 1.5px solid var(--gray-7);
  background-color: var(--gray-1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color var(--duration-fast), border-color var(--duration-fast);
}

/* Done is a filled box, not a tinted one — a checked row has to be readable at a glance down a list. */
.control[data-state='checked'] {
  border-color: var(--accent-9);
  background-color: var(--accent-9);
}

.control[data-disabled] {
  border-color: var(--gray-6);
  background-color: var(--gray-3);
}

.control[data-focus-visible] {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}

.indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-contrast);
}

.label {
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  font-family: var(--font-sans);
}
</style>
