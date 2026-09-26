<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { ScrollArea } from '@ark-ui/vue'
import type { ComponentPublicInstance, HTMLAttributes } from 'vue'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'

type Orientation = 'vertical' | 'horizontal'

const props = withDefaults(
  defineProps<{
    axis?: 'y' | 'x' | 'both'
    viewportClass?: HTMLAttributes['class']
    contentClass?: HTMLAttributes['class']
    // Declared so it lands on the viewport — the element that scrolls — and never on the root that
    // falls through the attrs. Left undefined it also clears Ark's own tabindex, which Ark sets only
    // while BOTH axes overflow; the old plain containers never had one.
    tabindex?: number | string
    // For a ribbon no taller than its own items (a tab strip, the type rail): an interactive bar there
    // would sit over the items and take their clicks and drops, so it only reads out while scrolling.
    passive?: boolean
  }>(),
  { axis: 'y', viewportClass: undefined, contentClass: undefined, tabindex: undefined, passive: false },
)

// The phone has no hover and owns its own momentum: its bar is a read-out only, so it never takes a
// touch and shows only while the list is moving. Read once — the frame never changes while the app is up.
const touch = props.passive || useShellFrame() === 'mobile'

const vertical = computed(() => props.axis !== 'x')
const horizontal = computed(() => props.axis !== 'y')
// A shorthand rather than overflow-x/-y: Ark puts `overflow: auto` inline on the viewport, and only the
// same key is guaranteed to replace it when the two style objects merge.
const viewportStyle = computed(() => ({ overflow: props.axis === 'y' ? 'hidden auto' : props.axis === 'x' ? 'auto hidden' : 'auto' }))
// Ark sizes content `min-width: fit-content` so a wide table can push the viewport sideways. On a
// vertical list that turns every nowrap label's full length into the list's width, and ellipsis stops
// working — so a y-only area gives the width back.
const contentStyle = computed(() => (props.axis === 'y' ? { minWidth: '0' } : undefined))

const viewport = shallowRef<HTMLElement | null>(null)
function setViewport(value: Element | ComponentPublicInstance | null) {
  const el = value instanceof Element ? value : value?.$el
  viewport.value = el instanceof HTMLElement ? el : null
}

// Ark marks a bar "scrolling" on every scroll event, including the ones code makes: restoring a
// position, revealing the selected row on open. A bar that lights up for those flashes on a surface
// nobody touched yet, so scrolling only shows it after a first input inside the area.
const armed = ref(false)
function arm() {
  armed.value = true
}

// Ark reports dragging for the whole area, so both bars would widen; the one under the pointer is
// tracked here.
const dragging = ref<Orientation | null>(null)
function endDrag() {
  dragging.value = null
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}
function startDrag(orientation: Orientation, event: PointerEvent) {
  if (event.button !== 0) return
  dragging.value = orientation
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}
onBeforeUnmount(endDrag)

// Ark's own track click jumps the thumb to the pointer and starts a drag. A click on a native track
// pages instead, so the track is a separate element: Ark ignores a pointerdown whose target is not the
// scrollbar itself, and this one does the paging.
function page(orientation: Orientation, event: PointerEvent) {
  const el = viewport.value
  const track = event.currentTarget
  if (event.button !== 0 || el == null || !(track instanceof HTMLElement)) return
  const thumb = track.parentElement?.querySelector('[data-part="thumb"]')
  if (thumb == null) return
  const rect = thumb.getBoundingClientRect()
  if (orientation === 'vertical') el.scrollBy({ top: (event.clientY < rect.top ? -1 : 1) * el.clientHeight * 0.9 })
  else el.scrollBy({ left: (event.clientX < rect.left ? -1 : 1) * el.clientWidth * 0.9 })
}

defineExpose({ viewport })
</script>

<template>
  <ScrollArea.Root
    class="scroll-area"
    :class="{ touch }"
    :data-armed="armed || undefined"
    @wheel.passive="arm"
    @keydown="arm"
    @pointerdown="arm"
    @touchstart.passive="arm"
  >
    <ScrollArea.Viewport :ref="setViewport" class="scroll-area-viewport" :class="viewportClass" :style="viewportStyle" :tabindex="tabindex">
      <ScrollArea.Content class="scroll-area-content" :class="contentClass" :style="contentStyle">
        <slot />
      </ScrollArea.Content>
    </ScrollArea.Viewport>
    <!-- mousedown is the native scrollbar's contract: using it never moves focus out of an editor. -->
    <ScrollArea.Scrollbar
      v-if="vertical"
      orientation="vertical"
      class="scroll-area-scrollbar"
      :class="{ dragging: dragging === 'vertical' }"
      @mousedown.prevent
    >
      <span class="scroll-area-track" aria-hidden="true" @pointerdown="page('vertical', $event)" />
      <ScrollArea.Thumb class="scroll-area-thumb" @pointerdown="startDrag('vertical', $event)" />
    </ScrollArea.Scrollbar>
    <ScrollArea.Scrollbar
      v-if="horizontal"
      orientation="horizontal"
      class="scroll-area-scrollbar"
      :class="{ dragging: dragging === 'horizontal' }"
      @mousedown.prevent
    >
      <span class="scroll-area-track" aria-hidden="true" @pointerdown="page('horizontal', $event)" />
      <ScrollArea.Thumb class="scroll-area-thumb" @pointerdown="startDrag('horizontal', $event)" />
    </ScrollArea.Scrollbar>
    <!-- Only measured: its size is what keeps the two bars from crossing in the corner. -->
    <ScrollArea.Corner v-if="axis === 'both'" class="scroll-area-corner" />
  </ScrollArea.Root>
</template>

<style scoped>
/* The bar is drawn over the content, never beside it: the viewport takes the whole box, and nothing the
   bar does changes where content starts or how wide it is. */
.scroll-area {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.scroll-area-viewport {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  scrollbar-width: none;
}

.scroll-area-viewport::-webkit-scrollbar {
  display: none;
}

.scroll-area-viewport:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

/* At least the viewport's height, so a list's trailing filler (a tree's root drop zone) can still
   reach the bottom of the box. */
.scroll-area-content {
  flex: 1 0 auto;
}

.scroll-area-scrollbar {
  z-index: 1;
  display: flex;
  box-sizing: border-box;
  opacity: 0;
  pointer-events: none;
  transition: opacity 240ms ease;
}

.scroll-area-scrollbar[data-orientation='vertical'] {
  flex-direction: column;
  align-items: flex-end;
  width: 12px;
  padding: 4px;
}

.scroll-area-scrollbar[data-orientation='horizontal'] {
  flex-direction: row;
  align-items: flex-end;
  height: 12px;
  padding: 4px;
}

/* Not display: none — Ark measures the thumb against the bar's own box in the same tick the overflow
   appears, before this attribute has updated, and a bar with no box yields a thumb that is wrong until
   the next scroll. */
.scroll-area-scrollbar[data-orientation='vertical']:not([data-overflow-y]),
.scroll-area-scrollbar[data-orientation='horizontal']:not([data-overflow-x]) {
  visibility: hidden;
}

.scroll-area:not(.touch) > .scroll-area-scrollbar:is([data-hover], .dragging),
.scroll-area[data-armed] > .scroll-area-scrollbar[data-scrolling] {
  opacity: 1;
  transition-duration: 80ms;
}

.scroll-area:not(.touch) > .scroll-area-scrollbar:is([data-hover], .dragging, [data-scrolling]) {
  pointer-events: auto;
}

.scroll-area-track {
  position: absolute;
  inset: 0;
}

.scroll-area-thumb {
  position: relative;
  flex: none;
  border-radius: var(--radius-full);
  background: var(--gray-a8);
  transition: background-color 120ms ease;
}

/* Ark's own floor is 20px and cannot be configured; past it the thumb may end up to 4px closer to the
   track's end than its inset. */
.scroll-area-scrollbar[data-orientation='vertical'] > .scroll-area-thumb {
  width: 4px;
  min-height: 24px;
  transition-property: width, background-color;
}

.scroll-area-scrollbar[data-orientation='horizontal'] > .scroll-area-thumb {
  height: 4px;
  min-width: 24px;
  transition-property: height, background-color;
}

.scroll-area:not(.touch) > .scroll-area-scrollbar:is(:hover, .dragging) > .scroll-area-thumb {
  background: var(--gray-a10);
}

.scroll-area:not(.touch) > .scroll-area-scrollbar[data-orientation='vertical']:is(:hover, .dragging) > .scroll-area-thumb {
  width: 8px;
}

.scroll-area:not(.touch) > .scroll-area-scrollbar[data-orientation='horizontal']:is(:hover, .dragging) > .scroll-area-thumb {
  height: 8px;
}

.scroll-area-corner {
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .scroll-area-scrollbar,
  .scroll-area-thumb {
    transition: none;
  }
}
</style>
