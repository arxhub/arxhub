<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'

const model = defineModel<string>()

defineProps<{
  placeholder?: string
  type?: string
  disabled?: boolean
  // `inline` sits inside a Row (an inline rename, a draft tree node) and must fit inside it: a
  // default control is as tall as the touch row and taller than the desktop one.
  // `flush` is a band rather than a box: no border or fill, the touch height, an inset focus ring.
  // `bare` is the text of a box somebody else draws (a numbered word of a recovery phrase): no border,
  // fill, padding or height of its own and no ring — the box shows focus with :focus-within.
  variant?: 'default' | 'title' | 'inline' | 'flush' | 'bare'
  // Monospaced, for text that is read character by character: a code, an address.
  mono?: boolean
  // Room for an icon a composing control draws over the box (SearchField): the box keeps its one
  // geometry, and the text starts clear of the icon instead of under it.
  iconStart?: boolean
  iconEnd?: boolean
  // The last value was refused (a wrong code): the danger border, and a shake that reduced motion drops.
  invalid?: boolean
}>()

const touch = useShellFrame() === 'mobile'
const el = useTemplateRef<HTMLInputElement>('el')
// A screen restores the caret after a pause that disabled the field (and so blurred it).
defineExpose({ focus: () => el.value?.focus() })
</script>

<template>
  <input
    ref="el"
    class="input"
    :class="{
      touch,
      title: variant === 'title',
      inline: variant === 'inline',
      flush: variant === 'flush',
      bare: variant === 'bare',
      mono,
      invalid,
      'icon-start': iconStart,
      'icon-end': iconEnd,
    }"
    :type="type || 'text'"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
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
/* design-ignore DS type ramp: a title field is the page's h1 being renamed, and takes its phone size. */
.input.title.touch { font-size: 1.625rem; }

.input.bare {
  height: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  font: inherit;
}

.input.bare:focus-visible {
  outline: none;
}

.input.mono {
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
}

.input.invalid {
  border-color: var(--danger-8);
  animation: input-shake 280ms;
}

@keyframes input-shake {
  20%,
  60% {
    transform: translateX(-8px);
  }
  40%,
  80% {
    transform: translateX(8px);
  }
}

/* The colour and the message still say it; only the movement goes. */
@media (prefers-reduced-motion: reduce) {
  .input.invalid {
    animation: none;
  }
}

.input::placeholder {
  color: var(--gray-10);
}

.input:disabled {
  background-color: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
