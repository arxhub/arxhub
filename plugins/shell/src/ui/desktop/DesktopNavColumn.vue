<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { TabTypeNav } from '../tab-type'
import { NAV_MAX, NAV_MIN } from './use-nav-column'

const props = defineProps<{
  nav: TabTypeNav
  title: string
  width: number
  collapsed: boolean
}>()
const emit = defineEmits<{ resize: [width: number]; toggle: [] }>()

// A type's navigation is NOT a tab: it is neither opened nor closed, it has no close control and it is
// in no list of what is open. On the desktop it is a permanent column, on the phone a panel over the
// content — one thing, two presentations.
const columnEl = ref<HTMLElement | null>(null)
let stop: (() => void) | null = null

// The width is dragged and remembered per type. The handle lives on the column's own edge and never
// goes away: a handle that appears on hover is hidden control, and the desktop frame hides nothing.
function startResize(event: PointerEvent): void {
  event.preventDefault()
  const column = columnEl.value
  if (column == null) return
  const left = column.getBoundingClientRect().left

  function onMove(move: PointerEvent): void {
    emit('resize', move.clientX - left)
  }
  function onUp(): void {
    stop?.()
  }
  stop = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    stop = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

// A drag outlives the column: switching type mid-drag would otherwise leave the listeners on the
// window forever.
onBeforeUnmount(() => stop?.())
</script>

<template>
  <div
    ref="columnEl"
    class="nav-column"
    :class="{ collapsed: props.collapsed }"
    :style="props.collapsed ? undefined : { width: `${Math.max(NAV_MIN, Math.min(NAV_MAX, props.width))}px` }"
    :aria-label="props.title"
    data-testid="nav-column"
  >
    <!-- A collapsed column does not disappear: a full-height strip stays behind, and it is what opens
         it again. Otherwise "collapsed" and "lost" look the same and there is no way back (F-15).
         There is no head of the frame's own here: the navigation draws its own strip, and the control
         that collapses this column is contributed INTO it (see nav-host.ts). -->
    <button
      v-if="props.collapsed"
      type="button"
      class="reveal"
      data-testid="nav-toggle"
      :aria-expanded="false"
      aria-label="Expand navigation"
      title="Expand navigation"
      @click="emit('toggle')"
    />

    <div v-show="!props.collapsed" class="body">
      <component :is="props.nav.component" />
    </div>

    <div
      v-if="!props.collapsed"
      class="resize"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :aria-label="`Resize ${title} navigation`"
      :aria-valuemin="NAV_MIN"
      :aria-valuemax="NAV_MAX"
      :aria-valuenow="width"
      @keydown.left.prevent="emit('resize', width - 16)"
      @keydown.right.prevent="emit('resize', width + 16)"
      @keydown.home.prevent="emit('resize', NAV_MIN)"
      @keydown.end.prevent="emit('resize', NAV_MAX)"
      title="Drag or use arrow keys to resize"
      @pointerdown="startResize"
    />
  </div>
</template>

<style scoped>
.nav-column {
  position: relative;
  display: flex;
  min-width: 0;
  flex-shrink: 0;
  flex-direction: column;
  border-right: 1px solid var(--gray-6);
  background: var(--gray-2);
}

/* Narrow on purpose — it is a seam you can grab, not a column. Off the 4px grid by one: the column's
   own 1px border is counted into the width by border-box, so 13 + 1 lands the visible strip on 12. */
.nav-column.collapsed {
  width: 13px;
}

.reveal {
  flex: 1;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.reveal:hover {
  background: var(--gray-4);
}

.reveal:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.body {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
}

/* Sits on the column's own edge, straddling it by 4px on each side: wide enough to grab without
   spending width on a visible strip beside the border that is already the seam. */
.resize {
  position: absolute;
  z-index: var(--z-index-docked);
  top: 0;
  right: -4px;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
}

.resize:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.resize:hover,
.resize:active {
  background-color: var(--accent-8);
}
</style>
