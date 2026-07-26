<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ left: boolean; right: boolean }>()
const emit = defineEmits<{ left: []; right: [] }>()

// How far inward a drag has to travel to read as intent rather than a stray touch near the bezel.
const THRESHOLD = 40

const start = ref<{ x: number; edge: 'left' | 'right' } | null>(null)

function onPointerDown(event: PointerEvent, edge: 'left' | 'right'): void {
  start.value = { x: event.clientX, edge }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  const from = start.value
  if (from == null) return
  const travelled = from.edge === 'left' ? event.clientX - from.x : from.x - event.clientX
  if (travelled < THRESHOLD) return
  start.value = null
  if (from.edge === 'left') emit('left')
  else emit('right')
}

function onPointerUp(): void {
  start.value = null
}

// A tap on the strip is the same intent as the drag, and the strip is too narrow to demand precision
// twice. Only fires when the drag did not already consume the gesture.
function onClick(edge: 'left' | 'right'): void {
  if (edge === 'left') emit('left')
  else emit('right')
}
</script>

<template>
  <!-- Affordances, not decoration: the strip is what says an edge here does something. Each renders
       only when a tab actually claimed that edge. -->
  <button
    v-if="props.left"
    type="button"
    class="edge left"
    aria-label="Open navigation"
    @pointerdown="onPointerDown($event, 'left')"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click="onClick('left')"
  />
  <button
    v-if="props.right"
    type="button"
    class="edge right"
    aria-label="Open documents"
    @pointerdown="onPointerDown($event, 'right')"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click="onClick('right')"
  />
</template>

<style scoped>
/* Only across the bottom two-fifths — that is the arc a thumb covers, and a full-height strip would
   swallow every tap within 24px of either edge of the note as well as reading as a page border. */
.edge {
  position: absolute;
  bottom: 0;
  height: 40%;
  width: 24px;
  border: none;
  padding: 0;
  /* The gesture owns horizontal movement here; the page must not scroll under the finger instead. */
  touch-action: none;
  cursor: pointer;
  transition: opacity var(--duration-fast);
  /* Quiet at rest: enough to say the edge does something, not enough to frame the content. */
  opacity: 0.5;
}

.edge:active,
.edge:focus-visible {
  opacity: 1;
}

.edge:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -2px;
}

.edge.left {
  left: 0;
  background: linear-gradient(to right, var(--accent-a4), transparent);
}

.edge.right {
  right: 0;
  background: linear-gradient(to left, var(--accent-a4), transparent);
}
</style>
