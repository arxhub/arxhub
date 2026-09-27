<script setup lang="ts">
import { type FormattingAction, FormattingToolbar } from '@arxhub/uikit/core'
import { toggleMark } from 'prosemirror-commands'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { computed } from 'vue'
import type { EditorMode } from '../editor-mode'
import { t } from '../i18n/messages'
import { EDITING_BLOCKS, HISTORY, MARKS, PRIMARY_EDITING } from './toolbar-actions'

// What takes the phone's object band while the keyboard is up: undo and redo first, then formatting for
// the caret or the selection, then the key that puts the keyboard away. Interactive mode keeps undo (a
// value change is undoable there) and has nothing to format.
// `onLink` is a prop, not an emit: Link may overflow into More, whose sheet takes focus out of the text and
// unmounts this band before the item runs — and an unmounted instance's emit is a no-op.
const props = defineProps<{ view: EditorView; revision: number; mode: EditorMode; onLink: () => void }>()

function run(command: Command): void {
  const view = props.view
  if (view.isDestroyed) return
  command(view.state, view.dispatch)
  view.focus()
}

const history = computed((): FormattingAction[] => {
  void props.revision
  const { state } = props.view
  return HISTORY.map((action) => ({
    id: action.id,
    label: action.label(),
    icon: action.icon,
    disabled: props.mode === 'readonly' || !action.run(state),
    run: () => run(action.run),
  }))
})

const actions = computed((): FormattingAction[] => {
  void props.revision
  if (props.mode !== 'editable') return []
  const { state } = props.view
  const { from, to, empty, $from } = state.selection
  const marks = MARKS.map((action) => {
    const mark = state.schema.marks[action.mark.name]
    return {
      id: action.id,
      label: action.label(),
      icon: action.icon,
      primary: PRIMARY_EDITING.has(action.id),
      active: mark != null && (empty ? mark.isInSet(state.storedMarks ?? $from.marks()) != null : state.doc.rangeHasMark(from, to, mark)),
      run: () => {
        if (mark != null) run(toggleMark(mark))
      },
    }
  })
  const blocks = EDITING_BLOCKS.map((action) => ({
    id: action.id,
    label: action.label(),
    icon: action.icon,
    primary: PRIMARY_EDITING.has(action.id),
    run: () => run(action.run()),
  }))
  const link = { id: 'link', label: t('marks.link'), icon: 'lu:link', primary: true, run: () => props.onLink() }
  // The mock's order on the band: marks, then the block a line turns into, then the link.
  const primary = [...marks, ...blocks].filter((action) => action.primary)
  const rest = [...marks, ...blocks].filter((action) => !action.primary)
  return [...primary, link, ...rest]
})
</script>

<template>
  <FormattingToolbar :actions="actions" :history="history" dismiss-keyboard />
</template>
