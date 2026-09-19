<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { MIN_UNLOCK_CODE_LENGTH } from '../device-lock'
import type { PinEntryProps } from './pin-entry'
import { usePinEntry } from './use-pin-entry'

const props = defineProps<PinEntryProps>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()
const { padOpen, claimPad, onInput, press, MAX_LENGTH, PAD_KEYS, focus } = usePinEntry(props, (value) => emit('update:modelValue', value))
// Six is the minimum, not a fixed length. Longer existing codes remain visible as masked dots and
// submission stays explicit so entering the sixth digit never submits a partially entered code.
const dotCount = computed(() => Math.max(MIN_UNLOCK_CODE_LENGTH, props.modelValue.length))
const letters: Record<string, string> = { '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ' }
defineExpose({ focus })
</script>

<template>
  <div class="pin" data-testid="mobile-pin-entry" :class="{ disabled }" @focusin="claimPad">
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
    <div v-if="padOpen" class="pad" role="group" aria-label="Numeric keypad">
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
          @mousedown.prevent
          @click="press(key)"
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
  gap: 20px;
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

.input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: text;
}

.display:has(.input:focus-visible) .dots {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
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
  grid-template-columns: repeat(3, 1fr);
  justify-items: center;
  gap: 12px 16px;
  width: 100%;
  max-width: 288px;
}

/* DS-1: a PIN keypad is a spatial input, not a row of generic form buttons. Its 72px circular
   targets keep the familiar phone layout and leave room between adjacent digits. */
.key {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 72px;
  height: 72px;
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
