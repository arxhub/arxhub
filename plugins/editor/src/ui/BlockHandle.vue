<script setup lang="ts">
import { actionMenu, IconButton } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { Node } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { insertBlock, moveBlocksTo } from '../block-actions'
import { BlockSelection, selectedBlocks } from '../block-selection'
import type { BlockCommand } from '../slash-commands'
import { openBlockMenu } from './block-menu'

const props = defineProps<{ view: EditorView; scroller: HTMLElement; revision: number; commands: readonly BlockCommand[] }>()
const iconSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const layoutRevision = ref(0)
const dragging = ref(false)
const dragStyle = ref<{ top: string; left: string }>()
const dropLine = ref<{ top: string; left: string; width: string }>()
let gesture: { x: number; y: number; pointerY: number; doc: Node; target: number | null; element: HTMLElement; pointerId: number } | null = null
let animation = 0
watch(
  () => props.revision,
  () => {
    if (gesture && (props.view.state.doc !== gesture.doc || (dragging.value && !(props.view.state.selection instanceof BlockSelection))))
      cancel()
  },
)
const measure = () => {
  layoutRevision.value++
}
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(props.scroller)
  props.scroller.addEventListener('scroll', measure)
})
onUnmounted(() => {
  cancel()
  observer?.disconnect()
  props.scroller.removeEventListener('scroll', measure)
})
const position = computed(() => {
  void props.revision
  void layoutRevision.value
  const { $from } = props.view.state.selection
  const pos = $from.depth ? $from.before(1) : $from.pos
  const node = props.view.nodeDOM(pos)
  const panel = props.scroller.parentElement
  if (!(node instanceof HTMLElement) || !panel) return null
  const block = node.getBoundingClientRect()
  const scroll = props.scroller.getBoundingClientRect()
  const parent = panel.getBoundingClientRect()
  if (block.bottom <= scroll.top || block.top >= scroll.bottom) return null
  const top = Math.max(scroll.top, Math.min(block.top, scroll.bottom - 64))
  return { top: `${top - parent.top}px`, left: `${block.left - parent.left - 36}px` }
})
function open(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  openBlockMenu(props.view, rect.left, rect.bottom)
}

function insert(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  actionMenu.open(
    props.commands.map((command) => ({
      id: command.id,
      label: command.label,
      icon: command.icon,
      onSelect: () => {
        if (props.view.isDestroyed) return
        insertBlock(command)(props.view.state, props.view.dispatch)
        props.view.focus()
      },
    })),
    { title: 'Insert block', x: rect.left, y: rect.bottom },
  )
}

function start(event: PointerEvent) {
  if (event.button !== 0 || props.view.isDestroyed) return
  const element = event.currentTarget as HTMLElement
  gesture = {
    x: event.clientX,
    y: event.clientY,
    pointerY: event.clientY,
    doc: props.view.state.doc,
    target: null,
    element,
    pointerId: event.pointerId,
  }
  dragStyle.value = position.value ?? undefined
  element.setPointerCapture(event.pointerId)
}

function locate() {
  if (!gesture || props.view.isDestroyed || gesture.doc !== props.view.state.doc) {
    cancel()
    return
  }
  const panel = props.scroller.parentElement?.getBoundingClientRect()
  const editor = props.view.dom.getBoundingClientRect()
  const viewport = props.scroller.getBoundingClientRect()
  if (!panel) return
  let target = props.view.state.doc.content.size
  let top = editor.top
  let found = false
  props.view.state.doc.forEach((_node, pos) => {
    if (found) return
    const dom = props.view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return
    const rect = dom.getBoundingClientRect()
    if (gesture && gesture.pointerY < rect.top + rect.height / 2) {
      target = pos
      top = rect.top
      found = true
    } else top = rect.bottom
  })
  gesture.target = moveBlocksTo(target)(props.view.state) ? target : null
  dropLine.value =
    gesture.target === null || top < viewport.top || top > viewport.bottom
      ? undefined
      : {
          top: `${top - panel.top}px`,
          left: `${editor.left - panel.left}px`,
          width: `${editor.width}px`,
        }
}

function scroll() {
  if (!gesture || !dragging.value) return
  const rect = props.scroller.getBoundingClientRect()
  const y = gesture.pointerY
  const delta = y < rect.top + 40 ? -12 : y > rect.bottom - 40 ? 12 : 0
  if (delta) {
    props.scroller.scrollTop += delta
    locate()
  }
  animation = requestAnimationFrame(scroll)
}

function move(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  gesture.pointerY = event.clientY
  if (!dragging.value && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 8) {
    const range = selectedBlocks(props.view.state)
    if (!range) return
    dragging.value = true
    if (!(props.view.state.selection instanceof BlockSelection))
      props.view.dispatch(props.view.state.tr.setSelection(BlockSelection.create(props.view.state.doc, range.from, range.to)))
    animation = requestAnimationFrame(scroll)
  }
  if (dragging.value) locate()
}

function finish() {
  if (!gesture) return
  const { target, element, doc } = gesture
  const moved = dragging.value
  cancel()
  if (props.view.isDestroyed || props.view.state.doc !== doc) return
  if (moved) {
    if (target !== null) moveBlocksTo(target)(props.view.state, props.view.dispatch)
    props.view.focus()
  } else open(element)
}

function cancel() {
  const previous = gesture
  gesture = null
  dragging.value = false
  dropLine.value = undefined
  cancelAnimationFrame(animation)
  if (previous?.element.hasPointerCapture(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId)
}
</script>

<template>
  <div v-if="position || dragging" class="block-handle" :style="dragging ? dragStyle : position ?? undefined" @mousedown.prevent
    @pointerdown.prevent="start" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @lostpointercapture="cancel">
    <IconButton icon="lu:grip-vertical" tooltip="Block actions" @click="$event.detail === 0 && open($event.currentTarget as HTMLElement)" />
  </div>
  <div v-if="position && !dragging" class="block-insert" :style="position" @mousedown.prevent>
    <IconButton icon="lu:plus" tooltip="Insert block" @click="insert($event.currentTarget as HTMLElement)" />
  </div>
  <div v-if="dropLine" class="block-drop-line" :style="dropLine" aria-hidden="true" />
</template>

<style scoped>
.block-handle { position: absolute; touch-action: none; cursor: grab; }
.block-insert { position: absolute; margin-top: 32px; }
.block-drop-line { position: absolute; height: 2px; background: var(--accent-8); pointer-events: none; }
</style>
