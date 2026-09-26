<script setup lang="ts">
import { useId } from 'vue'
import type { GateLayoutProps } from './gate-layout'
import Icon from './Icon.vue'
import ScrollArea from './ScrollArea.vue'

const props = defineProps<GateLayoutProps>()
const titleId = useId()
</script>

<template>
  <!-- Deliberately not <main>: the app's own main landmark is what tells the rest of the suite (and a
       screen reader) that the app itself has come up, and a gate must not answer to that. The fixed box
       wraps the ScrollArea because Ark writes `position: relative` inline on the area's own root. -->
  <div class="gate" :aria-labelledby="$slots.title ? titleId : undefined">
    <ScrollArea class="gate-scroll" content-class="gate-content">
      <!-- No frame of its own: the window is the surface, and the column just sits centred on it. -->
      <div class="column" :class="[`width-${props.width ?? 'narrow'}`, { center }]">
        <span v-if="mark" class="mark" aria-hidden="true"><Icon :name="mark" :size="20" /></span>
        <header v-if="$slots.kicker || $slots.title || $slots.text" class="head">
          <p v-if="$slots.kicker" class="kicker"><slot name="kicker" /></p>
          <h1 v-if="$slots.title" :id="titleId" class="title"><slot name="title" /></h1>
          <p v-if="$slots.text" class="text"><slot name="text" /></p>
        </header>
        <div v-if="$slots.default" class="body"><slot /></div>
        <!-- On the desktop the dock is a plain wrapping row in the column; the band is the phone's. -->
        <div v-if="$slots.dock" class="dock"><slot name="dock" /></div>
        <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
        <div v-if="$slots.recovery" class="recovery"><slot name="recovery" /></div>
      </div>
    </ScrollArea>
  </div>
</template>

<style scoped>
/* Self-sufficient by design: a gate renders before the app does, so it leans on nothing but the design
   tokens, which theme-preset's fallback layer guarantees even when no theme has been applied yet. */
.gate {
  position: fixed;
  inset: 0;
  z-index: var(--z-index-gate);
  background-color: var(--gray-1);
  color: var(--gray-12);
  font-family: var(--font-sans);
}

.gate-scroll {
  width: 100%;
  height: 100%;
}

.gate-scroll :deep(.gate-content) {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: 32px 16px;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.width-narrow {
  max-width: 400px;
}

.width-wide {
  max-width: 520px;
}

/* The crash screen: a report with lists and traces, not one short question. */
.width-page {
  max-width: 704px;
}

.center {
  align-items: center;
  text-align: center;
}

.center > .body,
.center > .dock,
.center > .actions,
.center > .recovery {
  align-self: stretch;
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
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.dock {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* One rule for every action on a gate: full width, stacked, the primary last. */
.actions,
.recovery {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
