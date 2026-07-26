<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { SegmentGroup } from '@ark-ui/vue'
import type { SelectOption } from './options'

defineProps<{
  modelValue?: string
  options: SelectOption[]
  disabled?: boolean
  ariaLabel?: string
}>()

defineEmits<(e: 'update:modelValue', value: string) => void>()
</script>

<template>
  <SegmentGroup.Root
    class="root"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @value-change="$emit('update:modelValue', $event.value ?? '')"
  >
    <SegmentGroup.Item
      v-for="option in options"
      :key="option.value"
      class="item"
      :value="option.value"
      :disabled="option.disabled"
    >
      <SegmentGroup.ItemText class="text">{{ option.label }}</SegmentGroup.ItemText>
      <SegmentGroup.ItemControl />
      <SegmentGroup.ItemHiddenInput />
    </SegmentGroup.Item>
  </SegmentGroup.Root>
</template>

<style scoped>
.root {
  display: inline-flex;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-xs);
  background: var(--gray-1);
  overflow: hidden;
}

.root[data-disabled] {
  background: var(--gray-2);
  border-color: var(--gray-6);
}

.item {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 16px;
  border-right: 1px solid var(--gray-4);
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.item:last-of-type {
  border-right: none;
}

.item[data-hover]:not([data-state='checked']):not([data-disabled]) {
  background: var(--gray-3);
  color: var(--gray-12);
}

.item[data-state='checked'] {
  background: var(--accent-3);
  color: var(--accent-11);
  font-weight: var(--font-weight-medium);
}

.item[data-focus-visible] {
  outline: 2px solid var(--accent-8);
  outline-offset: -2px;
}

.item[data-disabled] {
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
