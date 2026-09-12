export interface FormattingAction {
  id: string
  label: string
  icon: string
  active?: boolean
  primary?: boolean
  run(): void
}
