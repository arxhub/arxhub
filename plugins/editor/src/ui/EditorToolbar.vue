<script setup lang="ts">
import { Button, FormattingToolbar, Strip } from '@arxhub/uikit/core'
import { toggleMark } from 'prosemirror-commands'
import type { MarkType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { computed } from 'vue'
// The action tables live beside this file rather than in it, so the test can check the very tables the
// toolbar renders instead of a list of names retyped by hand — which is how two dead buttons shipped.
import { BLOCKS, HISTORY, LISTS, MARKS } from './toolbar-actions'

const props = defineProps<{ view: EditorView | null; onSave?: () => void; canSave: boolean; revision?: number }>()

function cmd(command: Command) {
  if (!props.view) return
  command(props.view.state, props.view.dispatch)
  props.view.focus()
}

function isMarkActive(markType: MarkType): boolean {
  if (!props.view) return false
  const { from, $from, to, empty } = props.view.state.selection
  if (empty) return !!markType.isInSet(props.view.state.storedMarks ?? $from.marks())
  return props.view.state.doc.rangeHasMark(from, to, markType)
}
const actions = computed(() => {
  void props.revision
  return [
    ...MARKS.map((action) => ({
      id: action.label,
      label: action.label,
      icon: action.icon,
      primary: ['Bold', 'Italic'].includes(action.label),
      active: isMarkActive(action.mark),
      run: () => cmd(toggleMark(action.mark)),
    })),
    ...[...BLOCKS, ...LISTS].map((action) => ({ id: action.label, label: action.label, icon: action.icon, run: () => cmd(action.run()) })),
    ...HISTORY.map((action) => ({
      id: action.label,
      label: action.label,
      icon: action.icon,
      primary: action.label === 'Undo',
      run: () => cmd(action.run),
    })),
  ]
})
</script>

<template>
  <Strip>
    <FormattingToolbar :actions="actions" />
    <template #actions>
      <Button variant="secondary" :disabled="!canSave" @click="onSave?.()">Save</Button>
    </template>
  </Strip>
</template>
