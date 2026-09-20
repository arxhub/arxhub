<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'

const touch = useShellFrame() === 'mobile'

// The one band above content: a header, a tab bar, a formatting row, a filter row. Geometry lives here
// and nowhere else (DS-1) — a consumer passes content, never a height, a padding, a surface or a border.
// A strip with a title and a strip with only controls are the SAME role (DS-2 in .claude/rules/design.md),
// which is why the title is a slot rather than a second component: eight implementations with five
// paddings, two surfaces and two border steps is what the second component produced.
withDefaults(
  defineProps<{
    title?: string
    // A strip divides two regions and says so with a rule. The exception is a strip that is already
    // inside a bordered box (a dialog closes its own edge), not a matter of taste.
    bordered?: boolean
    // A size="lg" IconButton already fills the strip's own height — the 8px right inset built for
    // text and smaller icons then just eats into it instead of framing it. Set this when the strip
    // ends in one, so the icon reaches the edge on purpose instead of overflowing into it by accident.
    flushActions?: boolean
    // Full-height controls provide their own hit area; text insets would leave empty cells beside them.
    flush?: boolean
  }>(),
  { bordered: true },
)
</script>

<template>
  <div class="strip" :class="{ touch, bordered, flush, 'flush-actions': flushActions }">
    <span v-if="title || $slots.title" class="strip-title">
      <slot name="title">{{ title }}</slot>
    </span>
    <div class="strip-content">
      <slot />
    </div>
    <div v-if="$slots.actions" class="strip-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: var(--size-md);
  padding: 0 8px;
  background: var(--gray-2);
  font-size: var(--font-size-sm);
}

/* Touch controls need their full target inside the band, not above and below it. */
.strip.touch {
  height: var(--size-xl);
}

.strip.bordered {
  /* Draw the divider inside the token height without stealing a pixel from its controls. */
  box-shadow: inset 0 -1px 0 var(--gray-6);
}

.strip.flush-actions {
  padding-right: 0;
}

.strip.flush {
  padding: 0;
  gap: 0;
}

.strip.flush > .strip-content,
.strip.flush > .strip-actions {
  gap: 0;
}

/* 8px more than the strip's own inset, so a title reads as a label of the region rather than as the
   first control in a row of them. It SHRINKS (and only then ellipsizes, which is what the two rules
   below were always for): with `flex-shrink: 0` the ellipsis could never fire, so a strip whose actions
   outgrew its region clipped the last button instead — the vault tree's own strip lost the frame's
   control that way, off the edge of a 280px column, still focusable and no longer visible. A label
   cut short reads; a button cut off does not. */
.strip-title {
  min-width: 0;
  padding-left: 8px;
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.strip-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.strip-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}
</style>
