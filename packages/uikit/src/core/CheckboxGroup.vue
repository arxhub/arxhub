<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Checkbox, CheckboxGroup } from '@ark-ui/vue'
import { useShellFrame } from '../hooks/useShellFrame'
// biome-ignore lint/correctness/noUnusedImports: used in template
import Icon from './Icon.vue'
import type { SelectOption } from './options'

defineProps<{
  modelValue?: string[]
  options: SelectOption[]
  disabled?: boolean
  ariaLabel?: string
}>()

defineEmits<(e: 'update:modelValue', value: string[]) => void>()
const touch = useShellFrame() === 'mobile'
</script>

<template>
  <CheckboxGroup
    class="root"
    :class="{ touch }"
    role="group"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @value-change="$emit('update:modelValue', $event)"
  >
    <Checkbox.Root
      v-for="option in options"
      :key="option.value"
      class="item"
      :value="option.value"
      :disabled="option.disabled"
    >
      <Checkbox.Control class="control">
        <Checkbox.Indicator class="indicator">
          <Icon name="lu:check" :size="touch ? 16 : 12" />
        </Checkbox.Indicator>
      </Checkbox.Control>
      <Checkbox.Label class="label">{{ option.label }}</Checkbox.Label>
      <Checkbox.HiddenInput />
    </Checkbox.Root>
  </CheckboxGroup>
</template>

<style scoped>
.root {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 24px;
  max-width: 560px;
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 148px;
  height: var(--size-2xs);
  cursor: pointer;
  user-select: none;
}

.root.touch .item {
  height: var(--size-xl);
}

.item[data-disabled] {
  cursor: not-allowed;
}

.control {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: var(--size-xs-half);
  height: var(--size-xs-half);
  border: 1.5px solid var(--gray-7);
  border-radius: var(--radius-xs);
  background: var(--gray-1);
}

.root.touch .control {
  width: var(--size-xl-half);
  height: var(--size-xl-half);
}

.control[data-state='checked'] {
  border-color: var(--accent-9);
  background: var(--accent-9);
}

.control[data-disabled] {
  border-color: var(--gray-6);
  background: var(--gray-3);
}

.control[data-focus-visible] {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}

.indicator {
  display: grid;
  place-items: center;
  color: var(--accent-contrast);
}

.label {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
}

.root.touch .label {
  font-size: var(--font-size-md);
}

.item[data-disabled] .label {
  color: var(--gray-9);
}
</style>
