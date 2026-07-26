// One option in a choice control (Segmented, RadioGroup, CheckboxGroup). `hint` is the sentence a
// list has room for and a segmented control does not — controls that cannot show it ignore it.
export interface SelectOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}
