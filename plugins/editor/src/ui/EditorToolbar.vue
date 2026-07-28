<script setup lang="ts">
import { Button, IconButton, Separator, Strip } from '@arxhub/uikit/core'
import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import type { MarkType } from 'prosemirror-model'
import { wrapInList } from 'prosemirror-schema-list'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { schema } from '../editor-schema'

const props = defineProps<{ view: EditorView | null; onSave?: () => void }>()

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

// One icon system, declared as data so the row cannot drift back into a mix of notations. It used to run
// "B I S U ` H1 H2 H3 ¶ • 1. ❝ ↩ ↪" — letters, typographic marks, and two COLOUR EMOJI for undo/redo that
// carry their own blue tiles and follow no theme. The markdown editor showed the same actions as lucide
// icons already, so one product drew one job two ways.
const MARKS: { label: string; icon: string; mark: MarkType }[] = [
  { label: 'Bold', icon: 'lu:bold', mark: schema.marks.bold },
  { label: 'Italic', icon: 'lu:italic', mark: schema.marks.italic },
  { label: 'Strikethrough', icon: 'lu:strikethrough', mark: schema.marks.strike },
  { label: 'Underline', icon: 'lu:underline', mark: schema.marks.underline },
  { label: 'Inline code', icon: 'lu:code', mark: schema.marks.code },
]

const BLOCKS: { label: string; icon: string; run: () => Command }[] = [
  { label: 'Heading 1', icon: 'lu:heading-1', run: () => setBlockType(schema.nodes.heading, { level: 1 }) },
  { label: 'Heading 2', icon: 'lu:heading-2', run: () => setBlockType(schema.nodes.heading, { level: 2 }) },
  { label: 'Heading 3', icon: 'lu:heading-3', run: () => setBlockType(schema.nodes.heading, { level: 3 }) },
  { label: 'Paragraph', icon: 'lu:pilcrow', run: () => setBlockType(schema.nodes.paragraph) },
]

const LISTS: { label: string; icon: string; run: () => Command }[] = [
  { label: 'Bulleted list', icon: 'lu:list', run: () => wrapInList(schema.nodes.bullet_list) },
  { label: 'Numbered list', icon: 'lu:list-ordered', run: () => wrapInList(schema.nodes.ordered_list) },
  { label: 'Quote', icon: 'lu:quote', run: () => wrapIn(schema.nodes.blockquote) },
]

const HISTORY: { label: string; icon: string; run: Command }[] = [
  { label: 'Undo', icon: 'lu:undo', run: undo },
  { label: 'Redo', icon: 'lu:redo', run: redo },
]
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
      <Button variant="secondary" size="sm" @click="onSave?.()">Save</Button>
    </template>
  </Strip>
</template>
