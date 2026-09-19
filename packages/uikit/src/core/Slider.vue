<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Slider } from '@ark-ui/vue'
import { useShellFrame } from '../hooks/useShellFrame'

const props = defineProps<{
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

// Ark models every slider as a multi-thumb range; this wrapper only ever exposes the first thumb.
function onValueChange(details: { value: number[] }): void {
  const next = details.value[0]
  if (next !== undefined) emit('update:modelValue', next)
}
</script>

<template>
  <Slider.Root
    class="root"
    :class="{ touch }"
    :model-value="props.modelValue == null ? undefined : [props.modelValue]"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    @value-change="onValueChange"
  >
    <Slider.Control class="control">
      <Slider.Track class="track">
        <Slider.Range class="range" />
      </Slider.Track>
      <Slider.Thumb class="thumb" :index="0" :aria-label="ariaLabel">
        <Slider.HiddenInput />
      </Slider.Thumb>
    </Slider.Control>
    <Slider.ValueText class="readout" /><span v-if="unit" class="unit">{{ unit }}</span>
  </Slider.Root>
</template>

<style scoped>
.root {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 260px;
}

.control {
  display: flex;
  align-items: center;
  position: relative;
  flex: 1;
  min-width: 0;
  height: var(--size-xs-half);
  cursor: pointer;
}

.root.touch .control {
  height: var(--size-md);
}

.root[data-disabled] .control {
  cursor: not-allowed;
}

.track {
  width: 100%;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--gray-4);
}

.root.touch .track {
  height: 6px;
}

.range {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent-9);
}

.root[data-disabled] .range {
  background: var(--gray-9);
}

.thumb {
  width: 12px;
  height: 12px;
  border: 1px solid var(--accent-9);
  border-radius: var(--radius-full);
  background: var(--gray-1);
  box-shadow: var(--shadow-xs);
}

.root.touch .thumb {
  width: var(--size-md);
  height: var(--size-md);
}

.thumb[data-focus-visible] {
  outline: 2px solid var(--accent-8);
  outline-offset: 2px;
}

.root[data-disabled] .thumb {
  border-color: var(--gray-9);
}

.readout {
  min-width: var(--size-xl-half);
  text-align: right;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
}

.unit {
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-10);
}
</style>
