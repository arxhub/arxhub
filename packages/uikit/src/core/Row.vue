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
  }>(),
  { as: 'div', selected: false, disabled: false, depth: 0, tone: 'neutral', wrap: false },
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
    :class="[tone, { selected, disabled, wrap, touch }]"
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

.row:hover:not(.disabled):not(.selected) {
  background: var(--gray-4);
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

.row.danger {
  color: var(--danger-11);
}

.row.warning {
  color: var(--warning-11);
}

/* Flat, not faded — an unavailable row must not read as a dimmed available one. */
.row.disabled {
  background: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
