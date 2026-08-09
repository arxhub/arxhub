<script setup lang="ts">
import { computed, onUnmounted } from 'vue'

const props = defineProps<{
  direction: 'horizontal' | 'vertical'
  // The split's current first-pane ratio (0.1–0.9, enforced by the store) — drives aria-valuenow and
  // is the base a keyboard nudge adds/subtracts from.
  ratio: number
}>()

const emit = defineEmits<{
  resize: [ratio: number]
}>()

// A keyboard nudge moves the same fraction of the container a drag would cover in a small pointer
// move — big enough to feel like a step, small enough for several presses to land on a precise split.
const KEYBOARD_STEP = 0.02

let cleanupDrag: (() => void) | null = null

onUnmounted(() => {
  cleanupDrag?.()
})

// The separator's own orientation is the axis its bar is drawn on, which is the OPPOSITE of the split
// `direction` prop: panes arranged in a row (`direction: 'horizontal'`) are divided by a vertical
// line, and vice versa. This is the WAI-ARIA window-splitter convention for aria-orientation — it
// describes the bar, not the layout — and it is why this does not just echo `props.direction`.
const ariaOrientation = computed(() => (props.direction === 'horizontal' ? 'vertical' : 'horizontal'))

const ariaValueNow = computed(() => Math.round(props.ratio * 100))

// TODO: add touch support (touchstart / touchmove / touchend)
function onMouseDown(e: MouseEvent) {
  e.preventDefault()
  const container: HTMLElement | null = (e.target as HTMLElement).parentElement
  if (!container) return

  const el: HTMLElement = container
  const isHorizontal = props.direction === 'horizontal'

  function onMouseMove(me: MouseEvent) {
    const rect = el.getBoundingClientRect()
    const ratio = isHorizontal ? (me.clientX - rect.left) / rect.width : (me.clientY - rect.top) / rect.height
    emit('resize', Math.max(0.1, Math.min(0.9, ratio)))
  }

  function cleanup() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    cleanupDrag = null
  }

  function onMouseUp() {
    cleanup()
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  cleanupDrag = cleanup
}

// Arrow keys perpendicular to the bar move it the way a drag would — Left/Right for a vertical bar
// (a horizontally-arranged split), Up/Down for a horizontal one. Emits the same `resize` ratio the
// drag path does, so LayoutRenderer applies it through the one store mutation (`setRatio`) either way.
function onKeyDown(e: KeyboardEvent) {
  const isHorizontal = props.direction === 'horizontal'
  let delta = 0
  if (isHorizontal && e.key === 'ArrowLeft') delta = -KEYBOARD_STEP
  else if (isHorizontal && e.key === 'ArrowRight') delta = KEYBOARD_STEP
  else if (!isHorizontal && e.key === 'ArrowUp') delta = -KEYBOARD_STEP
  else if (!isHorizontal && e.key === 'ArrowDown') delta = KEYBOARD_STEP
  else return

  e.preventDefault()
  emit('resize', Math.max(0.1, Math.min(0.9, props.ratio + delta)))
}
</script>

<template>
  <div
    class="resize-handle"
    :class="direction"
    tabindex="0"
    role="separator"
    :aria-orientation="ariaOrientation"
    aria-label="Resize panels"
    :aria-valuenow="ariaValueNow"
    aria-valuemin="10"
    aria-valuemax="90"
    @mousedown="onMouseDown"
    @keydown="onKeyDown"
  />
</template>

<style scoped>
/* Zero in the resize axis — no permanent 4px band between two panel groups — but the grab area still
   needs to be wide enough to find, so ::after carries that instead, reaching 4px into each pane on
   either side of it. Same technique as .rail-resize in DesktopMiniAppShell.vue: hovering the
   pseudo-element's rendered pixels counts as hovering this element, so :hover/:active/:focus-visible
   below and the @mousedown in the template all still fire correctly. */
.resize-handle {
  position: relative;
  flex-shrink: 0;
  z-index: 1;
}

.resize-handle::after {
  content: '';
  position: absolute;
  background-color: transparent;
  transition: background-color var(--duration-fast);
}

.resize-handle:hover::after,
.resize-handle:active::after {
  background-color: var(--accent-7);
}

.resize-handle:focus-visible::after {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.resize-handle.horizontal {
  width: 0;
  height: 100%;
  cursor: col-resize;
}

.resize-handle.horizontal::after {
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
}

.resize-handle.vertical {
  width: 100%;
  height: 0;
  cursor: row-resize;
}

.resize-handle.vertical::after {
  left: 0;
  right: 0;
  top: -4px;
  bottom: -4px;
}
</style>
