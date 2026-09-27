<script setup lang="ts">
import { useId } from 'vue'
import { useKeyboardInset } from '../hooks/useKeyboardInset'
import type { GateLayoutProps } from './gate-layout'
import Icon from './Icon.vue'
import ScrollArea from './ScrollArea.vue'
import Strip from './Strip.vue'

// `width` is the desktop column's measure; the phone's column is the screen.
defineProps<GateLayoutProps>()
const titleId = useId()
const keyboardInset = useKeyboardInset()
</script>

<template>
  <!-- Not <main>, for the same reason as the desktop gate. The gate ends where the keyboard begins, so
       the dock and the actions stay above it rather than under it. -->
  <div class="gate" :aria-labelledby="$slots.title ? titleId : undefined" :style="{ bottom: `${keyboardInset}px` }">
    <ScrollArea class="gate-scroll" :class="{ bleed }" content-class="gate-content">
      <div class="column" :class="{ center, end: center && anchor === 'end' }">
        <span v-if="mark" class="mark" aria-hidden="true"><Icon :name="mark" :size="20" /></span>
        <header v-if="$slots.kicker || $slots.title || $slots.text" class="head" :class="{ unseen: bleed }">
          <p v-if="$slots.kicker" class="kicker"><slot name="kicker" /></p>
          <h1 v-if="$slots.title" :id="titleId" class="title"><slot name="title" /></h1>
          <p v-if="$slots.text" class="text"><slot name="text" /></p>
        </header>
        <div v-if="$slots.default" class="body"><slot /></div>
      </div>
    </ScrollArea>
    <!-- The dock (a phrase's suggestions) is a band above the keyboard on the phone, scrolled sideways. -->
    <Strip v-if="$slots.dock" below class="dock">
      <ScrollArea axis="x" passive>
        <div class="dock-row"><slot name="dock" /></div>
      </ScrollArea>
    </Strip>
    <!-- Nothing pressable at the top of a phone: every action sits in the bottom third, under the thumb. -->
    <div v-if="$slots.actions || $slots.recovery" class="foot" :class="{ lifted: keyboardInset > 0 }">
      <slot name="actions" />
      <slot name="recovery" />
    </div>
  </div>
</template>

<style scoped>
.gate {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: var(--z-index-gate);
  display: flex;
  flex-direction: column;
  background-color: var(--gray-1);
  color: var(--gray-12);
  font-family: var(--font-sans);
}

.gate-scroll {
  flex: 1 1 auto;
  min-height: 0;
}

/* ScrollArea's content is already at least the viewport's height; the column fills it so a body can
   push its last part (a keypad) down to the actions. */
.gate-scroll :deep(.gate-content) {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: calc(40px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left));
}

.gate-scroll.bleed :deep(.gate-content) {
  padding: 0;
}

.gate-scroll.bleed .column {
  gap: 0;
}

.head.unseen {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.column {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.center {
  justify-content: center;
  align-items: center;
  text-align: center;
}

.center > .body {
  align-self: stretch;
}

.center.end {
  justify-content: flex-end;
}

.column:not(.center) > .body {
  flex: 1 1 auto;
}

.mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  width: var(--size-xl);
  height: var(--size-xl);
  border-radius: var(--radius-md);
  background-color: var(--accent-9);
  color: var(--accent-contrast);
}

.center > .mark {
  align-self: center;
}

.head,
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kicker {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--gray-12);
}

.text {
  margin: 0;
  font-size: var(--font-size-md);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.dock {
  flex: none;
}

.dock-row {
  display: flex;
  gap: 8px;
}

/* One rule for every action on a gate: full width, stacked, the primary last — nearest the thumb. */
.foot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px max(16px, env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}

/* Over the keyboard the home indicator is covered anyway; its inset would only float the actions. */
.foot.lifted {
  padding-bottom: 12px;
}
</style>
