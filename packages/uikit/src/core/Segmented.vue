<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { SegmentGroup } from '@ark-ui/vue'
import type { SelectOption } from './options'

defineProps<{
  modelValue?: string
  options: SelectOption[]
  disabled?: boolean
  ariaLabel?: string
  // Fill the width available and split it evenly between the segments. For a control in a rail or a
  // toolbar, where the intrinsic width of three labels is more than the column has.
  stretch?: boolean
}>()

defineEmits<(e: 'update:modelValue', value: string) => void>()
</script>

<template>
  <SegmentGroup.Root
    class="root"
    :class="{ stretch }"
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

.root.stretch {
  display: flex;
  width: 100%;
}

.root.stretch .item {
  flex: 1;
  min-width: 0;
  justify-content: center;
  padding: 0 8px;
}

.item {
  display: flex;
  align-items: center;
  height: var(--size-xs);
  padding: 0 16px;
  border-right: 1px solid var(--gray-4);
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
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
