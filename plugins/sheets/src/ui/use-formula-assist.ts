import { computed, nextTick, watch } from 'vue'
import { formulaHelp } from '../formula-help'
import { cycleAnchor, formulaReferences } from '../references'
import { useSheet } from './use-sheet'

export function useFormulaAssist() {
  const session = useSheet()
  const { inputRoot, activeAddress, draft, editable, commit, cancelEdit, finishEdit, focusFormula, blurFormula, composing, formulaFocused } =
    session

  const caret = session.formulaCaret
  const help = computed(() => formulaHelp(draft.value, caret.value))
  const refs = computed(() => formulaReferences(draft.value))
  const colors = ['var(--accent-11)', 'var(--success-11)', 'var(--warning-11)', 'var(--danger-11)']
  function position() {
    caret.value = inputRoot.value?.querySelector('input')?.selectionStart ?? draft.value.length
  }
  watch(draft, () => {
    void nextTick(position)
  })
  function replace(text: string, end: number) {
    draft.value = text
    void nextTick(() => {
      const input = inputRoot.value?.querySelector('input')
      input?.focus({ preventScroll: true })
      input?.setSelectionRange(end, end)
      position()
    })
  }
  function complete(name: string) {
    const start = caret.value - help.value.prefix.length,
      next = `${name}(`
    replace(draft.value.slice(0, start) + next + draft.value.slice(caret.value), start + next.length)
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return
    position()
    if (event.key === 'F4') {
      const result = cycleAnchor(draft.value, caret.value)
      if (result) {
        event.preventDefault()
        replace(result.text, result.caret)
      }
    } else if (event.key === 'Tab' && help.value.suggestions.length) {
      event.preventDefault()
      complete(help.value.suggestions[0].name)
    }
  }
  return {
    inputRoot,
    activeAddress,
    draft,
    editable,
    commit,
    cancelEdit,
    finishEdit,
    focusFormula,
    blurFormula,
    composing,
    formulaFocused,
    help,
    refs,
    colors,
    position,
    complete,
    keydown,
  }
}
