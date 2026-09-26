import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import type { PinEntryProps } from './pin-entry'
import { openPad } from './pin-pad'

const MAX_FREE_LENGTH = 32

// A beat after the last dot fills, so the dot is seen before the screen moves on.
export const AUTO_SUBMIT_DELAY_MS = 120

export function usePinEntry(props: PinEntryProps, update: (value: string) => void, submit: () => void) {
  // One row per three, with the empty cell under 7 so 0 sits where every keypad puts it.
  const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'] as const

  const maxLength = computed(() => props.length ?? MAX_FREE_LENGTH)
  const fixed = computed(() => props.length != null)
  // The native field of the pad entry, or the uikit Input of a fixed-length one: both focus.
  const input = useTemplateRef<{ focus(): void }>('input')
  const id = Symbol('pin-entry')
  const padOpen = computed(() => openPad.value === id)

  let autoSubmit: ReturnType<typeof setTimeout> | undefined
  const complete = () => props.length != null && props.modelValue.length === props.length && !props.disabled
  watch(
    () => props.modelValue,
    () => {
      clearTimeout(autoSubmit)
      if (complete()) autoSubmit = setTimeout(() => complete() && submit(), AUTO_SUBMIT_DELAY_MS)
    },
  )

  onBeforeUnmount(() => {
    clearTimeout(autoSubmit)
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
    const digits = el.value.replace(/\D/g, '').slice(0, maxLength.value)
    // A hardware keyboard can offer letters; the value the rest of the app sees never carries them.
    if (el.value !== digits) el.value = digits
    update(digits)
  }

  function press(key: string, restoreInputFocus = true): void {
    if (props.disabled) return
    const next = key === 'delete' ? props.modelValue.slice(0, -1) : `${props.modelValue}${key}`.slice(0, maxLength.value)
    update(next)
    if (restoreInputFocus) input.value?.focus()
  }

  // Enter on a fixed-length entry is the same submit the last digit would have made, taken now; before
  // the last digit there is nothing to submit yet.
  function confirm(): void {
    if (props.disabled || props.modelValue.length === 0) return
    if (fixed.value && props.modelValue.length !== props.length) return
    clearTimeout(autoSubmit)
    submit()
  }

  // A gate restores focus after scrypt has disabled and blurred the field.
  return { padOpen, claimPad, onInput, press, confirm, fixed, maxLength, PAD_KEYS, focus: () => input.value?.focus() }
}
