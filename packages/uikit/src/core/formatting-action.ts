export interface FormattingAction {
  id: string
  label: string
  icon: string
  active?: boolean
  disabled?: boolean
  primary?: boolean
  run(): void
}
