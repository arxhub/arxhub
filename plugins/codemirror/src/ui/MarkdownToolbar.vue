<script setup lang="ts">
import { IconButton, Separator } from '@arxhub/uikit/core'
import type { EditorView } from '@codemirror/view'
import { computed } from 'vue'
import {
  insertLink,
  isBoldActive,
  isBulletActive,
  isHeadingActive,
  isInlineCodeActive,
  isItalicActive,
  isQuoteActive,
  isStrikethroughActive,
  isTaskActive,
  toggleBold,
  toggleBullet,
  toggleHeading,
  toggleInlineCode,
  toggleItalic,
  toggleQuote,
  toggleStrikethrough,
  toggleTask,
} from '../markdown-commands'

// `revision` is bumped by CodeMirrorEditor's own update listener on every selection/doc change. `view`
// is a shallowRef holding a live object CodeMirror mutates in place (never reassigned), so without this
// Vue would never see a reason to recompute `isActive` below.
const props = defineProps<{ view: EditorView | null; revision?: number }>()

function run(command: (view: EditorView) => boolean): void {
  if (!props.view) return
  command(props.view)
  props.view.focus()
}

// One icon system, declared as data so the row cannot drift into a mix of letters and glyphs again. It
// previously ran "H1 H2 H3 · B I S </> · • ☑ ❝ 🔗" — three notations at once, the last of them a colour
// emoji that no theme can restyle and that reads as a foreign object on a dark base.
//
// `active` asks the same question the toggle command would answer for itself — is the selection already
// wrapped in the marker, is the line already prefixed — rather than a markdown parse. Link has none:
// inserting one is never a toggle.
const GROUPS: { label: string; icon: string; run: (view: EditorView) => boolean; active?: (view: EditorView) => boolean }[][] = [
  [
    { label: 'Heading 1', icon: 'lu:heading-1', run: (v) => toggleHeading(v, 1), active: (v) => isHeadingActive(v, 1) },
    { label: 'Heading 2', icon: 'lu:heading-2', run: (v) => toggleHeading(v, 2), active: (v) => isHeadingActive(v, 2) },
    { label: 'Heading 3', icon: 'lu:heading-3', run: (v) => toggleHeading(v, 3), active: (v) => isHeadingActive(v, 3) },
  ],
  [
    { label: 'Bold', icon: 'lu:bold', run: toggleBold, active: isBoldActive },
    { label: 'Italic', icon: 'lu:italic', run: toggleItalic, active: isItalicActive },
    { label: 'Strikethrough', icon: 'lu:strikethrough', run: toggleStrikethrough, active: isStrikethroughActive },
    { label: 'Inline code', icon: 'lu:code', run: toggleInlineCode, active: isInlineCodeActive },
  ],
  [
    { label: 'Bulleted list', icon: 'lu:list', run: toggleBullet, active: isBulletActive },
    { label: 'Task list', icon: 'lu:list-todo', run: toggleTask, active: isTaskActive },
    { label: 'Quote', icon: 'lu:quote', run: toggleQuote, active: isQuoteActive },
    { label: 'Link', icon: 'lu:link', run: insertLink },
  ],
]

const isActive = computed(() => {
  void props.revision
  const view = props.view
  return (action: { active?: (view: EditorView) => boolean }): boolean => (view != null && action.active != null ? action.active(view) : false)
})
</script>

<template>
  <!-- mousedown is prevented so pressing a button never moves focus out of the editor: losing focus
       collapses the selection, and the marker would land at the caret instead of around the text. -->
  <div class="md-toolbar" role="toolbar" aria-label="Formatting" @mousedown.prevent>
    <template v-for="(group, index) in GROUPS" :key="index">
      <Separator v-if="index > 0" />
      <IconButton
        v-for="action in group"
        :key="action.label"
        :icon="action.icon"
        :tooltip="action.label"
        :active="isActive(action)"
        @click="run(action.run)"
      />
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
</style>
