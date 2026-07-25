<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import {
  insertLink,
  toggleBold,
  toggleBullet,
  toggleHeading,
  toggleInlineCode,
  toggleItalic,
  toggleQuote,
  toggleStrikethrough,
  toggleTask,
} from '../markdown-commands'

const props = defineProps<{ view: EditorView | null }>()

function run(command: (view: EditorView) => boolean): void {
  if (!props.view) return
  command(props.view)
  props.view.focus()
}
</script>

<template>
  <!-- mousedown is prevented so pressing a button never moves focus out of the editor: losing focus
       collapses the selection, and the marker would land at the caret instead of around the text. -->
  <div class="md-toolbar" role="toolbar" aria-label="Formatting" @mousedown.prevent>
    <button type="button" title="Heading 1" aria-label="Heading 1" @click="run((v) => toggleHeading(v, 1))">H1</button>
    <button type="button" title="Heading 2" aria-label="Heading 2" @click="run((v) => toggleHeading(v, 2))">H2</button>
    <button type="button" title="Heading 3" aria-label="Heading 3" @click="run((v) => toggleHeading(v, 3))">H3</button>
    <span class="sep" />
    <button type="button" class="b" title="Bold" aria-label="Bold" @click="run(toggleBold)">B</button>
    <button type="button" class="i" title="Italic" aria-label="Italic" @click="run(toggleItalic)">I</button>
    <button type="button" class="s" title="Strikethrough" aria-label="Strikethrough" @click="run(toggleStrikethrough)">S</button>
    <button type="button" class="mono" title="Inline code" aria-label="Inline code" @click="run(toggleInlineCode)">&lt;/&gt;</button>
    <span class="sep" />
    <button type="button" title="Bulleted list" aria-label="Bulleted list" @click="run(toggleBullet)">•</button>
    <button type="button" title="Task list" aria-label="Task list" @click="run(toggleTask)">☑</button>
    <button type="button" title="Quote" aria-label="Quote" @click="run(toggleQuote)">❝</button>
    <button type="button" title="Link" aria-label="Link" @click="run(insertLink)">🔗</button>
  </div>
</template>

<style scoped>
.md-toolbar {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--gray-6);
  background: var(--gray-2);
  flex-wrap: wrap;
}

.md-toolbar button {
  min-width: var(--size-xs);
  height: var(--size-xs);
  padding: 0 0.375rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.md-toolbar button:hover {
  background: var(--gray-4);
  color: var(--gray-12);
}

.md-toolbar button:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.b {
  font-weight: 700;
}

.i {
  font-style: italic;
}

.s {
  text-decoration: line-through;
}

.mono {
  font-family: var(--font-mono);
}

.sep {
  width: 1px;
  height: var(--size-xs-half);
  margin: 0 0.25rem;
  background: var(--gray-6);
}
</style>
