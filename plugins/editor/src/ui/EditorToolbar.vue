<script setup lang="ts">
import { Button, IconButton, Separator, Strip } from '@arxhub/uikit/core'
import { toggleMark } from 'prosemirror-commands'
import type { MarkType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
// The action tables live beside this file rather than in it, so the test can check the very tables the
// toolbar renders instead of a list of names retyped by hand — which is how two dead buttons shipped.
import { BLOCKS, HISTORY, LISTS, MARKS } from './toolbar-actions'

const props = defineProps<{ view: EditorView | null; onSave?: () => void; canSave: boolean }>()

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
</script>

<template>
  <Strip>
    <IconButton
      v-for="action in MARKS"
      :key="action.label"
      :icon="action.icon"
      :tooltip="action.label"
      :active="isMarkActive(action.mark)"
      @click="cmd(toggleMark(action.mark))"
    />
    <Separator />
    <IconButton
      v-for="action in BLOCKS"
      :key="action.label"
      :icon="action.icon"
      :tooltip="action.label"
      @click="cmd(action.run())"
    />
    <Separator />
    <IconButton
      v-for="action in LISTS"
      :key="action.label"
      :icon="action.icon"
      :tooltip="action.label"
      @click="cmd(action.run())"
    />
    <Separator />
    <IconButton
      v-for="action in HISTORY"
      :key="action.label"
      :icon="action.icon"
      :tooltip="action.label"
      @click="cmd(action.run)"
    />
    <template #actions>
      <Button variant="secondary" size="sm" :disabled="!canSave" @click="onSave?.()">Save</Button>
    </template>
  </Strip>
</template>
