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
    @checked-change="$emit('update:modelValue', $event.checked)"
  >
    <Checkbox.Control class="control">
      <Checkbox.Indicator class="indicator">
        <Icon name="check" :size="12" />
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
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
}

.root[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.control {
  width: var(--size-xs-half);
  height: var(--size-xs-half);
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent-9);
  background-color: var(--accent-a4);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--duration-normal);
}

.control[data-focus-visible] {
  box-shadow: 0 0 0 2px var(--gray-1), 0 0 0 4px var(--accent-9);
}

.indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-9);
}

.label {
  font-size: var(--font-size-xs);
  color: var(--gray-12);
  font-family: var(--font-sans);
}
</style>
