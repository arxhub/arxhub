export interface PinEntryProps {
  modelValue: string
  label: string
  placeholder?: string
  autofocus?: boolean
  disabled?: boolean
  autocomplete?: string
  testId?: string
}

export interface PinEntryHandle {
  focus(): void
}
