<script setup lang="ts">
import { FormattingToolbar } from '@arxhub/uikit/core'
import type { EditorView } from '@codemirror/view'
import { computed } from 'vue'
import { historyActions, markdownActions } from '../markdown-actions'

// What takes the phone's object band while the keyboard is up: undo and redo first, the markdown marks
// for a note (a code file has nothing to format), and the key that puts the keyboard away.
const props = defineProps<{ view: EditorView | null; revision: number; note: boolean }>()

const actions = computed(() => {
  void props.revision
  return props.note ? markdownActions(props.view) : []
})
const history = computed(() => {
  void props.revision
  return historyActions(props.view)
})
</script>

<template>
  <FormattingToolbar :actions="actions" :history="history" dismiss-keyboard />
</template>
