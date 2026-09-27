<script setup lang="ts">
import { computed } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'
import { t } from '../i18n/messages'
import Icon from './Icon.vue'
import IconButton from './IconButton.vue'
import { stepZoomValue } from './zoom'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min: number
    max: number
    step?: number
    steps?: readonly number[]
    resetTo?: number
    labels?: { out: string; in: string; reset: string }
  }>(),
  { resetTo: 1, labels: undefined },
)

const emit = defineEmits<(e: 'update:modelValue', value: number) => void>()

const touch = useShellFrame() === 'mobile'
const size = touch ? 'xl' : 'lg'
// Drawn through the slot: IconButton's own glyph for lg/xl is 20, and DS-8 wants 14 in a strip, 16 in a touch row.
const glyph = touch ? 16 : 14

const scale = computed(() => ({ min: props.min, max: props.max, step: props.step, steps: props.steps }))
const outValue = computed(() => stepZoomValue(props.modelValue, -1, scale.value))
const inValue = computed(() => stepZoomValue(props.modelValue, 1, scale.value))
const percent = computed(() => `${Math.round(props.modelValue * 100)}%`)
</script>

<template>
  <div class="zoom-control" :class="{ touch }">
    <IconButton
      :size="size"
      :tooltip="labels?.out ?? t('zoom.out')"
      :disabled="outValue === modelValue"
      @click="emit('update:modelValue', outValue)"
    >
      <Icon name="lu:zoom-out" :size="glyph" />
    </IconButton>
    <button type="button" class="zoom-value" :aria-label="labels?.reset ?? t('zoom.reset')" @click="emit('update:modelValue', resetTo)">
      {{ percent }}
    </button>
    <IconButton
      :size="size"
      :tooltip="labels?.in ?? t('zoom.in')"
      :disabled="inValue === modelValue"
      @click="emit('update:modelValue', inValue)"
    >
      <Icon name="lu:zoom-in" :size="glyph" />
    </IconButton>
  </div>
</template>

<style scoped>
.zoom-control {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.zoom-value {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--size-md);
  min-width: var(--size-xl);
  padding: 0 4px;
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  line-height: var(--line-height-none);
  cursor: pointer;
  transition: background-color var(--duration-fast), color var(--duration-fast);
}

.touch .zoom-value {
  height: var(--size-xl);
  font-size: var(--font-size-sm);
}

.zoom-value:hover {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.zoom-value:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}
</style>
