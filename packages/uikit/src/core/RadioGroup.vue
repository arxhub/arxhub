<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { RadioGroup } from '@ark-ui/vue'
import { useShellFrame } from '../hooks/useShellFrame'
import type { SelectOption } from './options'

defineProps<{
  modelValue?: string
  options: SelectOption[]
  disabled?: boolean
  ariaLabel?: string
}>()

defineEmits<(e: 'update:modelValue', value: string) => void>()
const touch = useShellFrame() === 'mobile'
</script>

<template>
  <RadioGroup.Root
    class="root"
    :class="{ touch }"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @value-change="$emit('update:modelValue', $event.value ?? '')"
  >
    <RadioGroup.Item
      v-for="option in options"
      :key="option.value"
      class="item"
      :value="option.value"
      :disabled="option.disabled"
    >
      <RadioGroup.ItemControl class="control" />
      <div class="text">
        <RadioGroup.ItemText class="label">{{ option.label }}</RadioGroup.ItemText>
        <span v-if="option.hint" class="hint">{{ option.hint }}</span>
      </div>
      <RadioGroup.ItemHiddenInput />
    </RadioGroup.Item>
  </RadioGroup.Root>
</template>

<style scoped>
.root {
  display: flex;
  flex-direction: column;
  max-width: 560px;
}

.item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  user-select: none;
}

.root.touch .item {
  min-height: var(--size-xl);
  align-items: center;
  padding: 12px;
}

.item[data-hover]:not([data-disabled]) {
  background: var(--gray-3);
}

.item[data-state='checked'] {
  background: var(--accent-3);
}

.item[data-focus-visible] {
  outline: 2px solid var(--accent-8);
  outline-offset: -2px;
}

.item[data-disabled] {
  cursor: not-allowed;
}

.control {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin-top: 4px;
  border: 1.5px solid var(--gray-7);
  border-radius: var(--radius-full);
  background: var(--gray-1);
}

.root.touch .control {
  flex-basis: var(--size-xs);
  width: var(--size-xs);
  height: var(--size-xs);
  margin-top: 0;
}

/* The dot is drawn on the control itself — an inner element would need a second data-state hook for
   a mark that is only ever a filled circle. */
.control[data-state='checked'] {
  border-color: var(--accent-9);
  box-shadow: inset 0 0 0 4px var(--accent-9);
}

.root.touch .control[data-state='checked'] {
  box-shadow: inset 0 0 0 8px var(--accent-9);
}

.item[data-disabled] .control {
  border-color: var(--gray-6);
  background: var(--gray-3);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.label {
  font-size: var(--font-size-sm);
  color: var(--gray-12);
}

.hint {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.item[data-disabled] .label,
.item[data-disabled] .hint {
  color: var(--gray-9);
}
</style>
