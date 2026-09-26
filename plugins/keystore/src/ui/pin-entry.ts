export interface PinEntryProps {
  modelValue: string
  label: string
  placeholder?: string
  autofocus?: boolean
  disabled?: boolean
  autocomplete?: string
  testId?: string
  // A fixed length submits itself once the last digit is in — the six-digit rule. Left out, the entry
  // takes any length and waits for Enter or the confirm key: a lock set before the rule, whose length
  // nothing records.
  length?: number
  // The last attempt was refused: the entry shakes (or, with reduced motion, only changes colour).
  invalid?: boolean
  // What went wrong, said under the digits — where the eye already is, above the keypad on a phone.
  error?: string | null
  // The confirm key of a free-length entry. Ignored with `length`: there is nothing to confirm.
  confirmLabel?: string
}

export interface PinEntryHandle {
  focus(): void
}
