<script setup lang="ts">
import { computed, onUnmounted, ref, useSlots } from 'vue'
import { RAIL_MAX, RAIL_MIN, useRailWidth } from '../use-rail-width'

const props = withDefaults(
  defineProps<{
    // Shared-width key — same key links rails across mini-apps. Default links all of them.
    widthKey?: string
    // Force-hide the rail even when a #rail slot is provided.
    rail?: boolean
    // Accepted for one shape across both frames, unused here: the rail is a column you can see, so
    // nothing has to announce what is in it.
    railTitle?: string
    railIcon?: string
  }>(),
  { widthKey: 'default', rail: true },
)

const slots = useSlots()
const showRail = computed(() => props.rail && !!slots.rail)

// No footer here any more. The status bar belongs to the frame and spans the whole window under the
// type rail (F-14); a mini-app rendering its own was what put a second one on screen the moment the
// frame grew one of its own.
const railWidth = useRailWidth(props.widthKey)
const shellEl = ref<HTMLElement | null>(null)

let cleanup: (() => void) | null = null

function startResize(e: MouseEvent) {
  e.preventDefault()
  const shell = shellEl.value
  if (!shell) return
  const left = shell.getBoundingClientRect().left

  function onMouseMove(me: MouseEvent) {
    railWidth.value = Math.max(RAIL_MIN, Math.min(RAIL_MAX, me.clientX - left))
  }

  function stop() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', stop)
    cleanup = null
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', stop)
  cleanup = stop
}

onUnmounted(() => cleanup?.())
</script>

<template>
  <div ref="shellEl" class="mini-app-shell">
    <template v-if="showRail">
      <div class="rail" :style="{ width: `${railWidth}px` }">
        <slot name="rail" />
      </div>
      <div class="rail-resize" @mousedown="startResize" />
    </template>
    <div class="content-column">
      <div class="content">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mini-app-shell {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* The rail is a panel surface; the content beside it is the page. Same split as the app frame, so a
   mini-app's navigation reads as part of the chrome rather than as another document. */
.rail {
  flex-shrink: 0;
  height: 100%;
  overflow: auto;
  background-color: var(--gray-2);
  border-right: 1px solid var(--gray-6);
}

/* Zero width itself — the rail's own border-right is the seam, not a 4px strip beside it — but the
   hit area still needs to be wide enough to grab, so ::after carries that instead, centred on this
   element and reaching 4px into both the rail and the content on either side of it. Hovering the
   pseudo-element's rendered pixels counts as hovering this element (they are not separately
   hit-testable), so :hover/:active below and the @mousedown in the template both still fire correctly. */
.rail-resize {
  position: relative;
  flex-shrink: 0;
  width: 0;
  height: 100%;
  z-index: 1;
}

.rail-resize::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
  cursor: col-resize;
  background-color: transparent;
  transition: background-color var(--duration-fast);
}

.rail-resize:hover::after,
.rail-resize:active::after {
  background-color: var(--accent-8);
}

.content-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
