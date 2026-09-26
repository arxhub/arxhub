<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'

const model = defineModel<string>()

defineProps<{
  placeholder?: string
  type?: string
  disabled?: boolean
  // `inline` sits inside a Row (an inline rename, a draft tree node) and must fit inside it: a
  // default control is as tall as the touch row and taller than the desktop one.
  variant?: 'default' | 'title' | 'inline'
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
    :class="{ touch, title: variant === 'title', inline: variant === 'inline', 'icon-start': iconStart, 'icon-end': iconEnd }"
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
