<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { EditorView } from 'prosemirror-view'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { blockTarget, inspect, settingsAt, settingsLabel } from '../block-settings'
import type { ArxEditorComponent } from '../editor-extension'

const props = defineProps<{
  view: EditorView
  scroller: HTMLElement
  revision: number
  components: Readonly<Record<string, ArxEditorComponent>>
}>()
const iconSize = useShellFrame() === 'mobile' ? 'xl' : 'sm'
const hovered = ref<number | null>(null)
const layout = ref(0)
const measure = () => layout.value++
watch(
  () => {
    void props.revision
    return props.view.state.doc
  },
  () => {
    hovered.value = null
  },
)
function hover(event: PointerEvent) {
  if (!(event.target instanceof globalThis.Node) || !props.view.dom.contains(event.target)) return
  const at = props.view.posAtCoords({ left: event.clientX, top: event.clientY })
  hovered.value = at ? settingsAt(props.view.state, at.inside >= 0 ? at.inside : at.pos, props.components) : null
}
let observer: ResizeObserver | undefined
onMounted(() => {
  props.scroller.addEventListener('pointermove', hover)
  props.scroller.addEventListener('scroll', measure)
  observer = new ResizeObserver(measure)
  observer.observe(props.scroller)
  observer.observe(props.view.dom)
})
onUnmounted(() => {
  props.scroller.removeEventListener('pointermove', hover)
  props.scroller.removeEventListener('scroll', measure)
  observer?.disconnect()
})
const target = computed(() => {
  void props.revision
  void layout.value
  const pos = hovered.value ?? settingsAt(props.view.state, props.view.state.selection.from, props.components)
  if (pos === null) return null
  const node = props.view.state.doc.nodeAt(pos)
  const dom = props.view.nodeDOM(pos)
  const parent = props.scroller.parentElement
  if (!node || !(dom instanceof HTMLElement) || !parent) return null
  const block = dom.getBoundingClientRect(),
    scroll = props.scroller.getBoundingClientRect(),
    panel = parent.getBoundingClientRect()
  if (block.bottom <= scroll.top || block.top >= scroll.bottom) return null
  const size = iconSize === 'xl' ? 48 : 28
  return {
    pos,
    label: settingsLabel(node, props.components),
    style: {
      top: `${Math.max(scroll.top, Math.min(block.top, scroll.bottom - size)) - panel.top}px`,
      left: `${Math.min(block.right + 4, scroll.right - size) - panel.left}px`,
    },
  }
})
function open() {
  if (target.value) inspect(props.view, blockTarget(props.view.state.doc, target.value.pos))
}
</script>
<template>
  <div v-if="target" class="block-settings-handle" :style="target.style" @mousedown.prevent>
    <IconButton :size="iconSize" icon="lu:settings" :tooltip="`${target.label} settings`" @click="open" />
  </div>
</template>
<style scoped>
.block-settings-handle { position: absolute; z-index: 1; }
</style>
