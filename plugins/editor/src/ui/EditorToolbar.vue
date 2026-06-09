<script setup lang="ts">
import { Button, IconButton, Separator, Toolbar } from '@arxhub/uikit/core'
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
</script>

<template>
  <Toolbar :gap="2" wrap>
    <IconButton :active="isMarkActive(schema.marks.bold)" tooltip="Bold" @click="cmd(toggleMark(schema.marks.bold))"><strong>B</strong></IconButton>
    <IconButton :active="isMarkActive(schema.marks.italic)" tooltip="Italic" @click="cmd(toggleMark(schema.marks.italic))"><em>I</em></IconButton>
    <IconButton :active="isMarkActive(schema.marks.strike)" tooltip="Strikethrough" @click="cmd(toggleMark(schema.marks.strike))"><s>S</s></IconButton>
    <IconButton :active="isMarkActive(schema.marks.underline)" tooltip="Underline" @click="cmd(toggleMark(schema.marks.underline))"><u>U</u></IconButton>
    <IconButton :active="isMarkActive(schema.marks.code)" tooltip="Code" @click="cmd(toggleMark(schema.marks.code))">`</IconButton>
    <Separator />
    <IconButton tooltip="Heading 1" @click="cmd(setBlockType(schema.nodes.heading, { level: 1 }))">H1</IconButton>
    <IconButton tooltip="Heading 2" @click="cmd(setBlockType(schema.nodes.heading, { level: 2 }))">H2</IconButton>
    <IconButton tooltip="Heading 3" @click="cmd(setBlockType(schema.nodes.heading, { level: 3 }))">H3</IconButton>
    <IconButton tooltip="Paragraph" @click="cmd(setBlockType(schema.nodes.paragraph))">¶</IconButton>
    <Separator />
    <IconButton tooltip="Bullet list" @click="cmd(wrapInList(schema.nodes.bullet_list))">•</IconButton>
    <IconButton tooltip="Ordered list" @click="cmd(wrapInList(schema.nodes.ordered_list))">1.</IconButton>
    <IconButton tooltip="Blockquote" @click="cmd(wrapIn(schema.nodes.blockquote))">❝</IconButton>
    <Separator />
    <IconButton tooltip="Undo" @click="cmd(undo)">↩</IconButton>
    <IconButton tooltip="Redo" @click="cmd(redo)">↪</IconButton>
    <Separator grow />
    <Button variant="secondary" size="sm" @click="onSave?.()">Save</Button>
  </Toolbar>
</template>
