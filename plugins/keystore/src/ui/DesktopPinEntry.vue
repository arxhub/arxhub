<script setup lang="ts">
import { Button, Input } from '@arxhub/uikit/core'
import type { PinEntryProps } from './pin-entry'
import { usePinEntry } from './use-pin-entry'

const props = defineProps<PinEntryProps>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()
const { padOpen, claimPad, onInput, press, confirm, fixed, maxLength, PAD_KEYS, focus } = usePinEntry(
  props,
  (value) => emit('update:modelValue', value),
  () => emit('submit'),
)
defineExpose({ focus })
</script>

<template>
  <!-- A fixed-length code is typed on the keyboard the desktop already has, so the field is all there
       is; the on-screen pad stays for a free-length entry, the one Settings has always offered. -->
  <div class="pin" :class="{ fixed }" @focusin="fixed || claimPad()">
    <!-- The six digits are a control like any other field: the uikit's own box, set in the mono face. -->
    <Input
      v-if="fixed"
      ref="input"
      type="password"
      mono
      inputmode="numeric"
      :model-value="modelValue"
      :maxlength="maxLength"
      :disabled="disabled"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :aria-label="label"
      :invalid="invalid"
      :data-testid="testId"
      @input="onInput"
      @keydown.enter.prevent="confirm"
    />
    <div v-else class="field">
      <input
        ref="input"
        class="display"
        :class="{ invalid }"
        type="password"
        inputmode="none"
        :value="modelValue"
        :maxlength="maxLength"
        :disabled="disabled"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :aria-label="label"
        :aria-invalid="invalid || undefined"
        :data-testid="testId"
        @input="onInput"
        @keydown.enter.prevent="confirm"
      />
      <Button v-if="confirmLabel" size="lg" :disabled="disabled || !modelValue" @click="confirm">{{ confirmLabel }}</Button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="!fixed && padOpen" class="pad">
      <template v-for="(key, index) in PAD_KEYS" :key="index">
        <div v-if="key === ''" class="gap" />
        <button
          v-else
          class="key"
          type="button"
          :disabled="disabled"
          :data-testid="`pin-key-${key}`"
          @mousedown.prevent
          @click="press(key)"
        >
          {{ key === 'delete' ? 'Delete' : key }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* The pad is three keys wide; the box is what three touch keys and their gaps come to, and belongs to
   this component rather than to the scale (DS-5). A fixed-length field takes the column it is given. */
.pin {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 320px;
}

.pin.fixed {
  max-width: none;
}

.field {
  display: flex;
  gap: 8px;
}

/* Deviation from the Control role's 32px, and so not the uikit Input, for the free-length entry only:
   the display and the pad are one object, and a field half the height of the keys that fill it reads as
   belonging to something else. */
.display {
  flex: 1 1 auto;
  min-width: 0;
  height: var(--size-xl);
  padding: 0 12px;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  background-color: var(--gray-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-md);
  letter-spacing: 0.3em;
  text-align: center;
  color: var(--gray-12);
}

.display::placeholder {
  letter-spacing: normal;
  color: var(--gray-10);
}

.display:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.display:disabled {
  background-color: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}

.display.invalid {
  border-color: var(--danger-8);
  animation: shake 280ms;
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
  .display.invalid {
    animation: none;
  }
}

.error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--danger-11);
}

.fixed .error {
  text-align: center;
}

.pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.key {
  height: var(--size-xl);
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-xs);
  background-color: var(--gray-1);
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  line-height: var(--line-height-none);
  color: var(--gray-12);
  cursor: pointer;
}

.key:hover:not(:disabled) {
  background-color: var(--gray-4);
}

.key:active:not(:disabled) {
  background-color: var(--gray-5);
}

.key:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}

.key:disabled {
  background-color: var(--gray-3);
  border-color: transparent;
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
