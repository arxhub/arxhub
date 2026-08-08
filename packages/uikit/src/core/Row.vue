<script setup lang="ts">
import { computed } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'

// One item of an enumeration: a tree node, a menu item, a settings section, a search result, a log entry.
// Density is chosen by the FRAME, not by the consumer (AD-03 / .claude/rules/design.md): the frame is
// decided once at boot and never changes, so it is a property of the frame rather than a decision each
// list makes for itself. There is deliberately no `density` prop — that would be the second place a row
// height is defined, which is what this component exists to remove.
const props = withDefaults(
  defineProps<{
    // A row that is a control is a <button>; a row that is only presentation stays a <div>. Roles and
    // aria stay with the consumer — this component owns the box, not the semantics.
    as?: 'div' | 'button' | 'li' | 'a'
    selected?: boolean
    disabled?: boolean
    // Tree depth. The indent is a multiple of the role's own half-step, so nesting stays on the grid.
    depth?: number
    tone?: 'neutral' | 'danger' | 'warning'
    // A row whose content legitimately wraps (a result with a title and a path, a log line) grows DOWN
    // from the role's height instead of being clipped by it.
    wrap?: boolean
    // A row that is only read, never activated — a log entry. Both the pointer cursor and the hover fill
    // promise a click, and a log has nothing to handle one with.
    plain?: boolean
  }>(),
  { as: 'div', selected: false, disabled: false, depth: 0, tone: 'neutral', wrap: false, plain: false },
)

// inject() only runs during setup, and the frame never changes while the app is up — so this is read
// once and is deliberately not reactive.
const touch = useShellFrame() === 'mobile'
const indent = computed(() => ({ paddingLeft: `calc(8px + ${props.depth} * var(--size-2xs-half))` }))
</script>

<template>
  <component
    :is="as"
    class="row"
    :class="[tone, { selected, disabled, wrap, plain, touch }]"
    :style="indent"
    :disabled="as === 'button' && disabled ? true : undefined"
  >
    <slot />
  </component>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: var(--size-2xs);
  padding-right: 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-12);
  font: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.row.touch {
  height: var(--size-xl);
  font-size: var(--font-size-md);
}

/* Grows down from the role's height rather than being clipped by it. */
.row.wrap {
  height: auto;
  min-height: var(--size-2xs);
  align-items: flex-start;
  padding-top: 4px;
  padding-bottom: 4px;
}

.row.touch.wrap {
  min-height: var(--size-xl);
}

/* One highlight under two names: :hover for a row the pointer is over, and data-highlighted for a menu
   row, which Ark marks that way for the pointer AND for the roving focus. */
.row:hover:not(.disabled):not(.selected):not(.plain),
.row[data-highlighted]:not(.disabled):not(.selected) {
  background: var(--gray-4);
}

/* Read, not activated — see the `plain` prop. */
.row.plain {
  cursor: auto;
}

.row:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

/* One selection treatment for the whole product: a raised accent wash plus accent text at step 11. */
.row.selected {
  background: var(--accent-3);
  color: var(--accent-11);
  font-weight: var(--font-weight-medium);
}

/* A row that reports a condition — an entry logged at error level, an action that destroys something —
   says so twice: in its text and on its leading edge. In a dense list the colour of one word is not
   enough to find the line that failed. The edge is an inset shadow rather than a border so it costs no
   layout and the row's inset stays on the grid. */
.row.danger {
  color: var(--danger-11);
  box-shadow: inset 2px 0 0 var(--danger-9);
}

.row.warning {
  color: var(--warning-11);
  box-shadow: inset 2px 0 0 var(--warning-9);
}

.row.danger:hover:not(.disabled):not(.selected):not(.plain),
.row.danger[data-highlighted]:not(.disabled):not(.selected) {
  background: var(--danger-3);
}

.row.warning:hover:not(.disabled):not(.selected):not(.plain),
.row.warning[data-highlighted]:not(.disabled):not(.selected) {
  background: var(--warning-3);
}

/* Flat, not faded — an unavailable row must not read as a dimmed available one. */
.row.disabled {
  background: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
