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
    <div class="content">
      <slot />
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

.rail-resize {
  flex-shrink: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background-color: transparent;
  transition: background-color var(--duration-fast);
  z-index: 1;
}

.rail-resize:hover,
.rail-resize:active {
  background-color: var(--accent-8);
}

.content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
</style>
