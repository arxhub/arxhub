<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'

const model = defineModel<string>()

defineProps<{
  placeholder?: string
  type?: string
  disabled?: boolean
  // `inline` sits inside a Row (an inline rename, a draft tree node) and must fit inside it: a
  // default control is as tall as the touch row and taller than the desktop one.
  // `flush` is a band rather than a box: no border or fill, the touch height, an inset focus ring.
  variant?: 'default' | 'title' | 'inline' | 'flush'
  // Room for an icon a composing control draws over the box (SearchField): the box keeps its one
  // geometry, and the text starts clear of the icon instead of under it.
  iconStart?: boolean
  iconEnd?: boolean
}>()

const touch = useShellFrame() === 'mobile'
</script>

<template>
  <input
    class="input"
    :class="{ touch, title: variant === 'title', inline: variant === 'inline', flush: variant === 'flush', 'icon-start': iconStart, 'icon-end': iconEnd }"
    :type="type || 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    v-model="model"
  />
</template>

<style scoped>
.input {
  width: 100%;
  height: var(--size-xs);
  background-color: var(--gray-1);
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  padding: 0 12px;
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  outline: none;
  font-family: var(--font-sans);
  transition: border-color var(--duration-fast), background-color var(--duration-fast);
}

.input.touch {
  height: var(--size-xl);
  font-size: var(--font-size-md);
}

.input.inline {
  height: var(--size-xl-half);
}

.input.touch.inline {
  height: var(--size-xs);
}

.input.icon-start {
  padding-left: 32px;
}

.input.icon-end {
  padding-right: 32px;
}

.input.touch.icon-start {
  padding-left: 40px;
}

.input.touch.icon-end {
  padding-right: 48px;
}

/* A single focus ring shared with every other control — no border tint stacked under an outline. */
.input:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
  border-color: var(--accent-8);
}

.input.flush {
  height: var(--size-xl);
  padding-left: 16px;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  font-size: var(--font-size-md);
}

.input.flush.icon-start {
  padding-left: 44px;
}

.input.flush:focus-visible {
  outline-offset: -2px;
}

.input.title { height: auto; min-height: var(--size-xl); padding: 0; border: none; background: transparent; font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); line-height: var(--line-height-tight); }

.input::placeholder {
  color: var(--gray-10);
}

.input:disabled {
  background-color: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
