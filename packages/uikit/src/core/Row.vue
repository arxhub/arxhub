<script setup lang="ts">
import { computed, useAttrs, useSlots } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'
import Icon from './Icon.vue'

// One item of an enumeration: a tree node, a menu item, a settings section, a search result, a log entry.
// Density is chosen by the FRAME, not by the consumer (AD-03 / .claude/rules/design.md): the frame is
// decided once at boot and never changes, so it is a property of the frame rather than a decision each
// list makes for itself. There is deliberately no `density` prop — that would be the second place a row
// height is defined, which is what this component exists to remove.
// With a trailing control the row becomes a box holding two siblings, so a close button never nests inside
// the row's own <button>; the consumer's class and style belong to the box, everything else to the row.
defineOptions({ inheritAttrs: false })

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
    // The common shape of a list entry — a glyph, a name and a quieter second line — drawn by the role
    // itself, so a sheet of months and a sheet of sessions set their two lines the same way. Anything
    // else still goes in the default slot, after the text.
    icon?: string
    label?: string
    // A second line under the label. The row then grows down from its height: two lines never fit 28px.
    detail?: string
    // The pick marker: this is the one chosen. Separate from `selected`, which is where the owner IS —
    // a list of choices marks its choice even while the selection wash means something else.
    checked?: boolean
    // The row leads one level further in (a list of tabs to the whole vault) rather than acting in place.
    next?: boolean
  }>(),
  { as: 'div', selected: false, disabled: false, depth: 0, tone: 'neutral', wrap: false, plain: false, checked: false, next: false },
)

// inject() only runs during setup, and the frame never changes while the app is up — so this is read
// once and is deliberately not reactive.
const touch = useShellFrame() === 'mobile'
const glyph = touch ? 16 : 14
const wraps = computed(() => props.wrap || props.detail != null)
const indent = computed(() => ({ paddingLeft: `calc(8px + ${props.depth} * var(--size-2xs-half))` }))
const slots = useSlots()
const attrs = useAttrs()
const boxAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))
const rowAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
</script>

<template>
  <div v-if="slots.trailing" class="row has-trailing" :class="[tone, { selected, disabled, wrap: wraps, plain, touch }]" v-bind="boxAttrs">
    <component
      :is="as"
      class="row-main"
      :style="indent"
      :disabled="as === 'button' && disabled ? true : undefined"
      v-bind="rowAttrs"
    >
      <Icon v-if="icon" class="row-icon" :name="icon" :size="glyph" />
      <span v-if="label != null" class="row-text">
        <span class="row-label">{{ label }}</span>
        <span v-if="detail" class="row-detail">{{ detail }}</span>
      </span>
      <slot />
      <Icon v-if="checked" class="row-check" name="lu:check" :size="glyph" />
      <Icon v-if="next" class="row-check" name="lu:chevron-right" :size="glyph" />
    </component>
    <div class="row-trailing"><slot name="trailing" /></div>
  </div>
  <component
    :is="as"
    v-else
    class="row"
    :class="[tone, { selected, disabled, wrap: wraps, plain, touch }]"
    :style="indent"
    :disabled="as === 'button' && disabled ? true : undefined"
    v-bind="$attrs"
  >
    <Icon v-if="icon" class="row-icon" :name="icon" :size="glyph" />
    <span v-if="label != null" class="row-text">
      <span class="row-label">{{ label }}</span>
      <span v-if="detail" class="row-detail">{{ detail }}</span>
    </span>
    <slot />
    <Icon v-if="checked" class="row-check" name="lu:check" :size="glyph" />
    <Icon v-if="next" class="row-check" name="lu:chevron-right" :size="glyph" />
  </component>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: var(--size-2xs);
  /* A row's height is its role, not a suggestion: inside a flex column that runs out of room (the
     mobile settings nav once it had eight sections) the browser would otherwise shave a pixel or two
     off every row instead of letting the column scroll — 46px where the token says 48. */
  flex-shrink: 0;
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

/* The box keeps the row's surface, height and tones; the main part takes the inset and the text, and the
   trailing control sits flush against the right edge at the row's own height. */
.row.has-trailing {
  gap: 0;
  padding: 0;
  cursor: auto;
}

.row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  align-self: stretch;
  padding-right: 8px;
  border: none;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.row.wrap > .row-main {
  align-items: flex-start;
  padding-top: 4px;
  padding-bottom: 4px;
}

.row.plain > .row-main {
  cursor: auto;
}

.row.disabled > .row-main {
  cursor: not-allowed;
}

.row-main:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.row-trailing {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  align-self: stretch;
}

/* The glyph sits on the first line, not centred on two. */
.row-icon {
  flex-shrink: 0;
}

.row.wrap .row-icon,
.row.wrap .row-check {
  margin-top: 4px;
}

.row-text {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.row-label,
.row-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The mock's second line is the meta step in both frames: under a 16px touch label too. */
.row-detail {
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.row.selected .row-detail {
  color: var(--accent-11);
}

.row-check {
  flex-shrink: 0;
  margin-left: auto;
}

/* Flat, not faded — an unavailable row must not read as a dimmed available one. */
.row.disabled {
  background: var(--gray-3);
  color: var(--gray-9);
  cursor: not-allowed;
}
</style>
