// One option in a choice control (Segmented, RadioGroup, CheckboxGroup). `hint` is the sentence a
// list has room for and a segmented control does not — controls that cannot show it ignore it.
// `icon` and `count` are the other way round: a segment has room for a glyph and a tally (a sheet
// tab's type and its number of changes), a list row reads them as noise — only Segmented draws them.
export interface SelectOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
  icon?: string
  count?: number | string
}
