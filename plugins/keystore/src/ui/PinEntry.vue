<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { openPad } from './pin-pad'

// The display stays a real <input> rather than a row of drawn dots, because the desktop client mounts
// this same component and a hardware keyboard has to drive it: digits, Backspace and Enter then come
// from the element itself instead of a second key handler that would have to be kept in step with the
// pad. `inputmode="none"` is what keeps the OS keyboard from covering the pad on a phone — it suppresses
// the virtual keyboard without making the field any less typable from a real one.
const props = defineProps<{
  modelValue: string
  label: string
  placeholder?: string
  autofocus?: boolean
  disabled?: boolean
  autocomplete?: string
  testId?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string]; submit: [] }>()

// Long enough that nobody meets it, short enough that the code stays on one line of the display.
const MAX_LENGTH = 32

// One row per three, with the empty cell under 7 so 0 sits where every keypad puts it.
const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'] as const

const input = useTemplateRef<HTMLInputElement>('input')
const id = Symbol('pin-entry')
const padOpen = computed(() => openPad.value === id)

onBeforeUnmount(() => {
  if (openPad.value === id) openPad.value = null
})

function claimPad(): void {
  openPad.value = id
}

onMounted(() => {
  if (props.autofocus) input.value?.focus()
})

function onInput(event: Event): void {
  const el = event.target as HTMLInputElement
  const digits = el.value.replace(/\D/g, '').slice(0, MAX_LENGTH)
  // A hardware keyboard can offer letters; the value the rest of the app sees never carries them.
  if (el.value !== digits) el.value = digits
  emit('update:modelValue', digits)
}

// Disabling the field while scrypt runs blurs it, so a screen that re-enables it has to put the caret
// back itself — there is no other way to keep typing after a refused code.
defineExpose({ focus: () => input.value?.focus() })

function press(key: string): void {
  if (props.disabled) return
  const next = key === 'delete' ? props.modelValue.slice(0, -1) : `${props.modelValue}${key}`.slice(0, MAX_LENGTH)
  emit('update:modelValue', next)
  input.value?.focus()
}
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
