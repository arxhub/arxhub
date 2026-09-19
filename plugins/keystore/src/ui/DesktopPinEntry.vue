<script setup lang="ts">
import type { PinEntryProps } from './pin-entry'
import { usePinEntry } from './use-pin-entry'

const props = defineProps<PinEntryProps>()
const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()
const { padOpen, claimPad, onInput, press, MAX_LENGTH, PAD_KEYS, focus } = usePinEntry(props, (value) => emit('update:modelValue', value))
defineExpose({ focus })
</script>

<template>
  <div class="pin" @focusin="claimPad">
    <input
      ref="input"
      class="display"
      type="password"
      inputmode="none"
      :value="modelValue"
      :maxlength="MAX_LENGTH"
      :disabled="disabled"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :aria-label="label"
      :data-testid="testId"
      @input="onInput"
      @keydown.enter.prevent="emit('submit')"
    />
    <div v-if="padOpen" class="pad">
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
   this component rather than to the scale (DS-5). */
.pin {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 320px;
}

/* Deviation from the Control role's 32px: the display and the pad are one object, and a field half the
   height of the keys that fill it reads as belonging to something else. */
.display {
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
