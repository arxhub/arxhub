import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import type { PinEntryProps } from './pin-entry'
import { openPad } from './pin-pad'

export function usePinEntry(props: PinEntryProps, update: (value: string) => void) {
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
    update(digits)
  }

  function press(key: string): void {
    if (props.disabled) return
    const next = key === 'delete' ? props.modelValue.slice(0, -1) : `${props.modelValue}${key}`.slice(0, MAX_LENGTH)
    update(next)
    input.value?.focus()
  }

  // A gate restores focus after scrypt has disabled and blurred the field.
  return { padOpen, claimPad, onInput, press, MAX_LENGTH, PAD_KEYS, focus: () => input.value?.focus() }
}
