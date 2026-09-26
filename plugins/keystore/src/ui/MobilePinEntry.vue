<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { UNLOCK_CODE_LENGTH } from '../device-lock'
import type { PinEntryProps } from './pin-entry'
import { usePinEntry } from './use-pin-entry'

const props = defineProps<PinEntryProps>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()
const { onInput, press, confirm, fixed, maxLength, PAD_KEYS, focus } = usePinEntry(
  props,
  (value) => emit('update:modelValue', value),
  () => emit('submit'),
)
// A free-length entry is a lock set before the six-digit rule, whose code may be longer: its dots grow
// with what is typed, and the confirm key submits, so the sixth digit never submits a partial code.
const dotCount = computed(() => props.length ?? Math.max(UNLOCK_CODE_LENGTH, props.modelValue.length))
const confirmKey = computed(() => !fixed.value && props.confirmLabel != null)
// Focus may be on any keypad button after Tab. Keep typed digits local to this control without
// moving that focus; Enter and Space still activate the focused button through native click.
function onKeypadKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
  if (!(event.target instanceof HTMLButtonElement)) return
  const key = /^[0-9]$/.test(event.key) ? event.key : event.key === 'Backspace' || event.key === 'Delete' ? 'delete' : null
  if (key === null) return
  event.preventDefault()
  event.stopPropagation()
  press(key, false)
}

defineExpose({ focus })
</script>

<template>
  <div class="pin" data-testid="mobile-pin-entry" :class="{ disabled }">
    <label class="entry">
      <span class="label">{{ label }}</span>
      <span class="display">
        <!-- Keep a real password input for hardware keyboards, autofill and assistive technology.
             Only its visual rendering is replaced; inputmode prevents a second, OS keypad. -->
        <input
          ref="input"
          class="input"
          type="password"
          inputmode="none"
          tabindex="-1"
          :value="modelValue"
          :maxlength="maxLength"
          :disabled="disabled"
          :autocomplete="autocomplete"
          :aria-label="label"
          :data-testid="testId"
          @input="onInput"
          :aria-invalid="invalid || undefined"
          @keydown.enter.prevent="confirm"
        />
        <span class="dots" :class="{ invalid }" aria-hidden="true">
          <span v-for="dot in dotCount" :key="dot" class="dot" :class="{ filled: dot <= modelValue.length }" />
        </span>
      </span>
      <!-- Always in the layout, so a message appearing does not move the keypad under the thumb. -->
      <span class="error" role="alert">{{ error }}</span>
    </label>
    <div class="pad" role="group" aria-label="Numeric keypad" @keydown="onKeypadKeydown">
      <template v-for="(key, index) in PAD_KEYS" :key="index">
        <button
          v-if="key === '' && confirmKey"
          class="key confirm"
          type="button"
          :disabled="disabled || !modelValue"
          :aria-label="confirmLabel"
          data-testid="pin-key-confirm"
          @click="confirm"
        >
          <Icon name="lu:check" :size="20" />
        </button>
        <span v-else-if="key === ''" aria-hidden="true" />
        <button
          v-else
          class="key"
          :class="{ delete: key === 'delete' }"
          type="button"
          :disabled="disabled || (key === 'delete' && !modelValue)"
          :aria-label="key === 'delete' ? 'Delete last digit' : key"
          :data-testid="`pin-key-${key}`"
          @click="press(key, $event.detail !== 0)"
        >
          <Icon v-if="key === 'delete'" name="lu:delete" :size="20" />
          <span v-else class="digit">{{ key }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pin {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--size-xs-half);
  width: 100%;
}

.entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: 4px;
}

.label {
  font-size: var(--font-size-sm);
  color: var(--gray-11);
}

.display {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--size-xl);
  width: 100%;
  border-radius: var(--radius-sm);
}

/* The input is an assistive/hardware entry, not a second visual control. The always-visible dots
   show its value; keyboard focus is drawn on the keypad buttons instead (M-16, owner decision). */
.input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}

.dots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  max-width: 252px;
  padding: 12px;
  border-radius: var(--radius-sm);
  pointer-events: none;
}

.dot {
  width: 12px;
  height: 12px;
  border: 1px solid var(--gray-8);
  border-radius: var(--radius-full);
  background: transparent;
}

.dot.filled {
  border-color: var(--gray-12);
  background: var(--gray-12);
}

.dots.invalid {
  animation: shake 280ms;
}

.dots.invalid .dot {
  border-color: var(--danger-9);
}

.dots.invalid .dot.filled {
  background: var(--danger-9);
}

@keyframes shake {
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
  .dots.invalid {
    animation: none;
  }
}

.error {
  min-height: var(--size-md-half);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  text-align: center;
  color: var(--danger-11);
}

/* In a gate the keypad sits at the foot of the body, just above the actions — the thumb's reach. It
   takes the column's full width, three keys to a row (the 2026-09-26 mock, which replaced the round
   keys of M-16). */
.pad {
  margin-top: auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

/* DS-1: a PIN keypad is a spatial input, not a row of form actions, so its keys are not Buttons. */
.key {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--size-2xl);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--gray-3);
  color: var(--gray-12);
  font-family: var(--font-sans);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}

.digit {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-normal);
  font-variant-numeric: tabular-nums;
  line-height: var(--line-height-none);
}

.key.delete {
  background: transparent;
  color: var(--gray-11);
}

.key.confirm {
  background: var(--accent-9);
  color: var(--accent-contrast);
}

@media (hover: hover) {
  .key:hover:not(:disabled) {
    background: var(--gray-4);
  }

  .key.confirm:hover:not(:disabled) {
    background: var(--accent-10);
  }
}

.key:active:not(:disabled) {
  background: var(--gray-6);
}

.key:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}

.key:disabled {
  background: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}

.key.delete:disabled {
  background: transparent;
}

.disabled .dot.filled {
  border-color: var(--gray-9);
  background: var(--gray-9);
}

.disabled .input {
  cursor: not-allowed;
}
</style>
