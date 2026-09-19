<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { NumberInput } from '@ark-ui/vue'
import { useShellFrame } from '../hooks/useShellFrame'
import Icon from './Icon.vue'

defineProps<{
  modelValue?: number
  min?: number
  max?: number
  step?: number
  unit?: string
  disabled?: boolean
  ariaLabel?: string
}>()

const emit = defineEmits<(e: 'update:modelValue', value: number) => void>()
const touch = useShellFrame() === 'mobile'

// valueAsNumber is NaN while the field is mid-edit (empty, or just a minus sign); passing that up
// would clobber the model with a NaN the user never typed.
function onValueChange(details: { valueAsNumber: number }): void {
  if (!Number.isNaN(details.valueAsNumber)) emit('update:modelValue', details.valueAsNumber)
}
</script>

<template>
  <NumberInput.Root
    class="root"
    :class="{ touch }"
    :model-value="modelValue == null ? undefined : String(modelValue)"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    @value-change="onValueChange"
  >
    <NumberInput.Control class="control">
      <NumberInput.DecrementTrigger class="nudge" aria-label="Decrease">
        <Icon name="lu:minus" :size="touch ? 16 : 14" />
      </NumberInput.DecrementTrigger>
      <NumberInput.Input class="value" :aria-label="ariaLabel" />
      <span v-if="unit" class="unit">{{ unit }}</span>
      <NumberInput.IncrementTrigger class="nudge" aria-label="Increase">
        <Icon name="lu:plus" :size="touch ? 16 : 14" />
      </NumberInput.IncrementTrigger>
    </NumberInput.Control>
  </NumberInput.Root>
</template>

<style scoped>
.root {
  display: inline-flex;
}

.control {
  display: inline-flex;
  align-items: stretch;
  height: var(--size-xs);
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-xs);
  background: var(--gray-1);
  overflow: hidden;
}

.root.touch .control {
  height: var(--size-xl);
}

.control:focus-within {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
  border-color: var(--accent-8);
}

.root[data-disabled] .control {
  background: var(--gray-3);
  border-color: var(--gray-6);
}

.nudge {
  display: grid;
  place-items: center;
  width: var(--size-2xs);
  border: none;
  background: transparent;
  color: var(--gray-11);
  cursor: pointer;
}

.root.touch .nudge {
  width: var(--size-xl);
}

.nudge:first-child { border-right: 1px solid var(--gray-4); }
.nudge:last-child { border-left: 1px solid var(--gray-4); }

.nudge[data-hover]:not([data-disabled]) {
  background: var(--gray-3);
  color: var(--gray-12);
}

.nudge[data-disabled] {
  color: var(--gray-9);
  cursor: not-allowed;
}

.value {
  width: 72px;
  border: none;
  background: transparent;
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  outline: none;
}

.root.touch .value {
  width: 80px;
}

.value:disabled {
  color: var(--gray-9);
  cursor: not-allowed;
}

.unit {
  display: flex;
  align-items: center;
  padding-right: 8px;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-10);
}
</style>
