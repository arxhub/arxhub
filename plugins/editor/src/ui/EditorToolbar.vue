<script setup lang="ts">
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
  <div class="editor-toolbar">
    <button :class="{ active: isMarkActive(schema.marks.bold) }" @click="cmd(toggleMark(schema.marks.bold))"><strong>B</strong></button>
    <button :class="{ active: isMarkActive(schema.marks.italic) }" @click="cmd(toggleMark(schema.marks.italic))"><em>I</em></button>
    <button :class="{ active: isMarkActive(schema.marks.strike) }" @click="cmd(toggleMark(schema.marks.strike))"><s>S</s></button>
    <button :class="{ active: isMarkActive(schema.marks.underline) }" @click="cmd(toggleMark(schema.marks.underline))"><u>U</u></button>
    <button :class="{ active: isMarkActive(schema.marks.code) }" @click="cmd(toggleMark(schema.marks.code))">`</button>
    <span class="sep" />
    <button @click="cmd(setBlockType(schema.nodes.heading, { level: 1 }))">H1</button>
    <button @click="cmd(setBlockType(schema.nodes.heading, { level: 2 }))">H2</button>
    <button @click="cmd(setBlockType(schema.nodes.heading, { level: 3 }))">H3</button>
    <button @click="cmd(setBlockType(schema.nodes.paragraph))">¶</button>
    <span class="sep" />
    <button @click="cmd(wrapInList(schema.nodes.bullet_list))">•</button>
    <button @click="cmd(wrapInList(schema.nodes.ordered_list))">1.</button>
    <button @click="cmd(wrapIn(schema.nodes.blockquote))">❝</button>
    <span class="sep" />
    <button @click="cmd(undo)">↩</button>
    <button @click="cmd(redo)">↪</button>
    <span class="flex-gap" />
    <button class="save-btn" @click="onSave?.()">Save</button>
  </div>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--gray-4);
  flex-shrink: 0;
  flex-wrap: wrap;
  background: var(--gray-1);
}
.editor-toolbar button {
  padding: 3px 8px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--gray-11);
  min-width: 28px;
  line-height: 1.4;
}
.editor-toolbar button:hover { background: var(--gray-3); }
.editor-toolbar button.active { background: var(--gray-4); color: var(--gray-12); }
.sep { width: 1px; height: 16px; background: var(--gray-5); margin: 0 4px; flex-shrink: 0; }
.flex-gap { flex: 1; }
.save-btn { border: 1px solid var(--gray-5) !important; background: var(--gray-2) !important; }
</style>
