<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
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

// One icon system, declared as data so the row cannot drift into a mix of letters and glyphs again.
// It previously ran "H1 H2 H3 · B I S </> · • ☑ ❝ 🔗" — three notations at once, the last of them a
// colour emoji that no theme can restyle and that reads as a foreign object on a dark base.
const GROUPS: { label: string; icon: string; run: (view: EditorView) => boolean }[][] = [
  [
    { label: 'Heading 1', icon: 'lu:heading-1', run: (v) => toggleHeading(v, 1) },
    { label: 'Heading 2', icon: 'lu:heading-2', run: (v) => toggleHeading(v, 2) },
    { label: 'Heading 3', icon: 'lu:heading-3', run: (v) => toggleHeading(v, 3) },
  ],
  [
    { label: 'Bold', icon: 'lu:bold', run: toggleBold },
    { label: 'Italic', icon: 'lu:italic', run: toggleItalic },
    { label: 'Strikethrough', icon: 'lu:strikethrough', run: toggleStrikethrough },
    { label: 'Inline code', icon: 'lu:code', run: toggleInlineCode },
  ],
  [
    { label: 'Bulleted list', icon: 'lu:list', run: toggleBullet },
    { label: 'Task list', icon: 'lu:list-todo', run: toggleTask },
    { label: 'Quote', icon: 'lu:quote', run: toggleQuote },
    { label: 'Link', icon: 'lu:link', run: insertLink },
  ],
]
</script>

<template>
  <!-- mousedown is prevented so pressing a button never moves focus out of the editor: losing focus
       collapses the selection, and the marker would land at the caret instead of around the text. -->
  <div class="md-toolbar" role="toolbar" aria-label="Formatting" @mousedown.prevent>
    <template v-for="(group, index) in GROUPS" :key="index">
      <span v-if="index > 0" class="sep" />
      <button
        v-for="action in group"
        :key="action.label"
        type="button"
        :title="action.label"
        :aria-label="action.label"
        @click="run(action.run)"
      >
        <Icon :name="action.icon" :size="14" />
      </button>
    </template>
  </div>
</template>

<style scoped>
/* A group inside a strip, not a strip of its own: no surface, no rule, no wrapping — the row it sits
   in owns all three. It used to be a full-width band with its own bottom border, which is how the
   editor came to have three stacked bars above the first line of a note. */
.md-toolbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
}

/* A 14px glyph in a 32px box — the control height, so a formatting key lines up with every other
   control in the app rather than being sized by whatever letter it used to hold. */
.md-toolbar button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-xs);
  height: var(--size-xs);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
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

.sep {
  width: 1px;
  height: var(--size-xs-half);
  margin: 0 0.25rem;
  background: var(--gray-6);
}
</style>
