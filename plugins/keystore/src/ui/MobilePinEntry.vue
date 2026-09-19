<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { MIN_UNLOCK_CODE_LENGTH } from '../device-lock'
import type { PinEntryProps } from './pin-entry'
import { usePinEntry } from './use-pin-entry'

const props = defineProps<PinEntryProps>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()
const { onInput, press, MAX_LENGTH, PAD_KEYS, focus } = usePinEntry(props, (value) => emit('update:modelValue', value))
// Six is the minimum, not a fixed length. Longer existing codes remain visible as masked dots and
// submission stays explicit so entering the sixth digit never submits a partially entered code.
const dotCount = computed(() => Math.max(MIN_UNLOCK_CODE_LENGTH, props.modelValue.length))
const letters: Record<string, string> = { '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ' }
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
          :maxlength="MAX_LENGTH"
          :disabled="disabled"
          :autocomplete="autocomplete"
          :aria-label="label"
          :data-testid="testId"
          @input="onInput"
          @keydown.enter.prevent="emit('submit')"
        />
        <span class="dots" aria-hidden="true">
          <span v-for="dot in dotCount" :key="dot" class="dot" :class="{ filled: dot <= modelValue.length }" />
        </span>
      </span>
    </label>
    <div class="pad" role="group" aria-label="Numeric keypad" @keydown="onKeypadKeydown">
      <template v-for="(key, index) in PAD_KEYS" :key="index">
        <span v-if="key === ''" aria-hidden="true" />
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
          <template v-else>
            <span class="digit">{{ key }}</span>
            <span v-if="letters[key]" class="letters" aria-hidden="true">{{ letters[key] }}</span>
          </template>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pin {
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

.pad {
  display: grid;
  grid-template-columns: repeat(3, var(--size-2xl));
  justify-items: center;
  gap: 8px var(--size-2xl-half);
}

/* DS-1: a PIN keypad is a spatial input, not a row of form actions. Circular targets use the
   shared 64px step so a four-row keypad leaves room for the primary action on short phones. */
.key {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: var(--size-2xl);
  height: var(--size-2xl);
  border: 0;
  border-radius: var(--radius-full);
  background: var(--gray-3);
  color: var(--gray-12);
  font-family: var(--font-sans);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}

.digit {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-none);
}

.letters {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-none);
  letter-spacing: var(--letter-spacing-widest);
}

.key.delete {
  background: transparent;
}

@media (hover: hover) {
  .key:hover:not(:disabled) {
    background: var(--gray-4);
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
